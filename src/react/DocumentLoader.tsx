import { Suspense, use, useState } from "react";
import type {
  LoadedDocument,
  QuarantineReason,
  QuarantineRecord,
} from "@core/persistence";
import { CanvasBoard } from "./CanvasBoard";
import { Notice } from "./Notice";

export interface DocumentLoaderProps {
  /** The in-flight load of the persisted document. */
  loading: Promise<LoadedDocument>;
}

/**
 * Gates the board on the persisted document. The load is started by the
 * caller, once and outside render, so StrictMode's double render and
 * double-mounted effects cannot start it twice; this only waits on it.
 */
export function DocumentLoader({ loading }: DocumentLoaderProps) {
  // No fallback: the canvas has no background of its own, so an empty page is
  // exactly what the canvas looks like before anything paints on it. A local
  // load is fast enough that a "Loading…" label would only flash.
  return (
    <Suspense fallback={null}>
      <LoadedBoard loading={loading} />
    </Suspense>
  );
}

function LoadedBoard({ loading }: DocumentLoaderProps) {
  const loaded = use(loading);

  switch (loaded.status) {
    case "loaded":
      return <CanvasBoard db={loaded.db} initialScene={loaded.scene} />;
    case "quarantined":
      return <QuarantinedBoard db={loaded.db} record={loaded.record} />;
    case "unavailable":
      return (
        <CanvasBoard
          db={null}
          initialScene={[]}
          // Not dismissible: once out of sight, a canvas that persists nothing
          // looks exactly like one that does.
          notices={<Notice tone="error" message={UNAVAILABLE_MESSAGE} />}
        />
      );
  }
}

function QuarantinedBoard({ db, record }: { db: IDBDatabase; record: QuarantineRecord }) {
  // Only the notice is dismissed; the quarantine record itself is kept.
  const [noticeShown, setNoticeShown] = useState(true);

  return (
    <CanvasBoard
      db={db}
      initialScene={[]}
      notices={
        noticeShown && (
          <Notice
            message={QUARANTINE_MESSAGES[record.reason]}
            onDismiss={() => setNoticeShown(false)}
          />
        )
      }
    />
  );
}

const UNAVAILABLE_MESSAGE =
  "Saving is off: this browser won't let the app store your drawing, so it will be lost when you close the tab.";

const QUARANTINE_MESSAGES: Record<QuarantineReason, string> = {
  invalid:
    "Your saved drawing is damaged, so it couldn't be loaded. It was set aside, and you're starting on an empty canvas.",
  "unknown-format-version":
    "Your saved drawing comes from a newer version of the app, so it couldn't be loaded. It was set aside, and you're starting on an empty canvas.",
};
