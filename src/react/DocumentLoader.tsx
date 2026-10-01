import { Suspense, use, useState } from "react";
import type { LoadedDocument, QuarantineReason } from "@core/persistence";
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
  const { db, scene, quarantined } = use(loading);
  // Only the notice is dismissed; the quarantine record itself is kept.
  const [notice, setNotice] = useState(quarantined);

  return (
    <>
      <CanvasBoard db={db} initialScene={scene} />
      {notice && (
        <Notice
          message={QUARANTINE_MESSAGES[notice.reason]}
          onDismiss={() => setNotice(null)}
        />
      )}
    </>
  );
}

const QUARANTINE_MESSAGES: Record<QuarantineReason, string> = {
  invalid:
    "Your saved drawing is damaged, so it couldn't be loaded. It was set aside, and you're starting on an empty canvas.",
  "unknown-format-version":
    "Your saved drawing comes from a newer version of the app, so it couldn't be loaded. It was set aside, and you're starting on an empty canvas.",
};
