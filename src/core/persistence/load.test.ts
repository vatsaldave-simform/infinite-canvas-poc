import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_SCENE_KEY, loadDocument, removeLegacyScene } from "./load";

/** Node has no localStorage (ADR-0001); a Map-backed fake is all this needs. */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe("removeLegacyScene", () => {
  it("removes the old localStorage scene without reading it", () => {
    localStorage.setItem(LEGACY_SCENE_KEY, "}{");

    removeLegacyScene();

    expect(localStorage.getItem(LEGACY_SCENE_KEY)).toBeNull();
  });

  it("is a no-op when the key is already gone, so every boot can run it", () => {
    removeLegacyScene();
    removeLegacyScene();

    expect(localStorage.getItem(LEGACY_SCENE_KEY)).toBeNull();
  });

  it("leaves other keys alone", () => {
    localStorage.setItem("unrelated", "kept");
    localStorage.setItem(LEGACY_SCENE_KEY, "[]");

    removeLegacyScene();

    expect(localStorage.getItem("unrelated")).toBe("kept");
  });

  it("does not throw when localStorage itself is unavailable", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });

    expect(() => removeLegacyScene()).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    });
  });
});

/**
 * Stand in for `indexedDB` with an `open` whose request fires one handler on a
 * later task, as the real one does. Only the open request is faked: enough to
 * reach each way an open ends, and nothing a real database would answer.
 */
function stubOpen(handler: "onsuccess" | "onblocked", result?: unknown) {
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result } as unknown as IDBOpenDBRequest;
      setTimeout(() => (request[handler] as (() => void) | null)?.());
      return request;
    },
  });
}

describe("loadDocument", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves with storage unavailable when IndexedDB does not exist", async () => {
    // Node has no IndexedDB at all (ADR-0001), as some locked-down browsers don't.
    const loaded = await loadDocument();

    expect(loaded).toEqual({ status: "unavailable", error: expect.any(ReferenceError) });
    expect(console.error).toHaveBeenCalled();
  });

  it("resolves with storage unavailable when the open is blocked", async () => {
    // Another tab holds an older connection and will not let go; without
    // handling `onblocked`, the open would wait forever.
    stubOpen("onblocked");

    const loaded = await loadDocument();

    expect(loaded.status).toBe("unavailable");
  });

  it("closes the connection when the document cannot be read", async () => {
    const db = {
      close: vi.fn(),
      transaction: () => {
        throw new DOMException("Internal error.", "UnknownError");
      },
    };
    stubOpen("onsuccess", db);

    const loaded = await loadDocument();

    // Persisting off: a document that was never read is never written over.
    expect(loaded.status).toBe("unavailable");
    expect(db.close).toHaveBeenCalled();
  });
});
