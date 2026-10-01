import { beforeEach, describe, expect, it } from "vitest";
import { LEGACY_SCENE_KEY, removeLegacyScene } from "./load";

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
