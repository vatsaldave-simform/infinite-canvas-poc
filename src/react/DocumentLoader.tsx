import { Suspense, use } from "react";
import type { LoadedDocument } from "@core/persistence";
import { CanvasBoard } from "./CanvasBoard";

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
  const { db, scene } = use(loading);
  return <CanvasBoard db={db} initialScene={scene} />;
}
