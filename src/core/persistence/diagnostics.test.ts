import { beforeEach, describe, expect, it } from "vitest";
import { createSceneStore, type Scene } from "@core/scene";
import { loadScene, persistScene, SCENE_STORAGE_KEY } from "./local-storage";
import {
  clearStoredScene,
  corruptStoredScene,
  CORRUPTIONS,
  fillStore,
  findStorageCeiling,
  floodPersist,
  makeStressScene,
  measureScene,
  probePersist,
  STORAGE_PROBE_KEY,
} from "./diagnostics";

/**
 * Tests run in the node environment (ADR-0001), which has neither localStorage
 * nor a storage quota. This fake supplies both: an optional cap is what makes
 * the quota paths reachable at all outside a browser. The cap is counted in
 * characters of key + value, which is how Chrome bills the real one.
 */
function createMemoryStorage(capChars = Infinity): Storage {
  const entries = new Map<string, string>();

  const usedChars = (skipKey?: string) => {
    let chars = 0;
    for (const [key, value] of entries) {
      if (key === skipKey) continue;
      chars += key.length + value.length;
    }
    return chars;
  };

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
      const next = usedChars(key) + key.length + value.length;
      if (next > capChars) {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      }
      entries.set(key, value);
    },
  };
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe("makeStressScene", () => {
  it("is deterministic — same options, byte-identical JSON", () => {
    const options = { elements: 4, pointsPerElement: 9 };

    expect(JSON.stringify(makeStressScene(options))).toBe(
      JSON.stringify(makeStressScene(options)),
    );
  });

  it("honours element and point counts", () => {
    const scene = makeStressScene({ elements: 3, pointsPerElement: 12 });

    expect(scene).toHaveLength(3);
    for (const element of scene) {
      expect(element.type).toBe("freehand");
      if (element.type !== "freehand") throw new Error("expected freehand");
      expect(element.points).toHaveLength(12);
    }
  });

  it("bounds the decimals it emits when given a precision", () => {
    const scene = makeStressScene({
      elements: 2,
      pointsPerElement: 20,
      precision: 2,
    });

    for (const decimals of JSON.stringify(scene).matchAll(/\.(\d+)/g)) {
      expect(decimals[1].length).toBeLessThanOrEqual(2);
    }
  });

  it("emits unrounded coordinates when given no precision", () => {
    const scene = makeStressScene({ elements: 2, pointsPerElement: 20 });
    const longest = [...JSON.stringify(scene).matchAll(/\.(\d+)/g)].reduce(
      (max, match) => Math.max(max, match[1].length),
      0,
    );

    expect(longest).toBeGreaterThan(6);
  });

  it("makes rounding measurably cheaper — the same scene, fewer characters", () => {
    const options = { elements: 5, pointsPerElement: 50 };
    const raw = measureScene(makeStressScene(options));
    const rounded = measureScene(makeStressScene({ ...options, precision: 2 }));

    expect(rounded.points).toBe(raw.points);
    expect(rounded.chars).toBeLessThan(raw.chars);
  });

  it("round-trips through the real persist path", () => {
    const scene = makeStressScene({ elements: 2, pointsPerElement: 5 });

    persistScene(scene);

    expect(loadScene()).toEqual(scene);
  });
});

describe("measureScene", () => {
  it("counts the characters of the stored JSON, and their UTF-16 bytes", () => {
    const scene = makeStressScene({ elements: 2, pointsPerElement: 7 });
    const cost = measureScene(scene);

    expect(cost.chars).toBe(JSON.stringify(scene).length);
    expect(cost.utf16Bytes).toBe(cost.chars * 2);
    expect(cost.elements).toBe(2);
    expect(cost.points).toBe(14);
  });

  it("reports an empty scene as the two characters of []", () => {
    expect(measureScene([])).toMatchObject({
      elements: 0,
      points: 0,
      chars: 2,
      utf16Bytes: 4,
    });
  });
});

describe("probePersist", () => {
  it("reports success without leaving the synthetic scene behind", () => {
    const real = makeStressScene({ elements: 1, pointsPerElement: 3, seed: 7 });
    persistScene(real);

    const probe = probePersist(makeStressScene({ elements: 9, pointsPerElement: 40 }));

    expect(probe.error).toBeNull();
    expect(probe.elements).toBe(9);
    // Measuring a write must not turn the measurement into the document.
    expect(loadScene()).toEqual(real);
  });

  it("leaves the key absent if it was absent before", () => {
    probePersist(makeStressScene({ elements: 2, pointsPerElement: 5 }));

    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBeNull();
  });

  it("returns the QuotaExceededError instead of throwing it", () => {
    globalThis.localStorage = createMemoryStorage(2_000);

    const probe = probePersist(makeStressScene({ elements: 20, pointsPerElement: 50 }));

    expect(probe.error).toBeInstanceOf(Error);
    expect(probe.error?.name).toBe("QuotaExceededError");
  });
});

describe("findStorageCeiling", () => {
  it("finds the cap, in both characters and UTF-16 bytes", () => {
    globalThis.localStorage = createMemoryStorage(20_000);

    const ceiling = findStorageCeiling(100_000);

    expect(ceiling.utf16Bytes).toBe(ceiling.chars * 2);
    expect(ceiling.chars).toBeLessThanOrEqual(20_000);
    expect(ceiling.chars).toBeGreaterThan(19_000);
  });

  it("reports the room that is left, not the room there was", () => {
    globalThis.localStorage = createMemoryStorage(20_000);
    const empty = findStorageCeiling(100_000);

    persistScene(makeStressScene({ elements: 4, pointsPerElement: 20 }));
    const occupied = findStorageCeiling(100_000);

    expect(occupied.chars).toBeLessThan(empty.chars);
  });

  it("leaves storage exactly as it found it", () => {
    const scene = makeStressScene({ elements: 2, pointsPerElement: 5 });
    persistScene(scene);
    const before = localStorage.getItem(SCENE_STORAGE_KEY);

    findStorageCeiling(10_000);

    expect(localStorage.getItem(STORAGE_PROBE_KEY)).toBeNull();
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBe(before);
  });
});

describe("floodPersist", () => {
  it("stops at the first write that throws, and reports both sides of it", () => {
    globalThis.localStorage = createMemoryStorage(60_000);

    const result = floodPersist({ pointsPerElement: 20, step: 2, maxElements: 200 });

    expect(result.failed?.error?.name).toBe("QuotaExceededError");
    expect(result.lastOk?.error).toBeNull();
    expect(result.lastOk!.chars).toBeLessThan(result.failed!.chars);
    expect(result.lastOk!.elements).toBe(result.failed!.elements - 2);
  });

  it("reports no failure when it runs out of elements first", () => {
    const result = floodPersist({ pointsPerElement: 2, step: 1, maxElements: 3 });

    expect(result.failed).toBeNull();
    expect(result.lastOk?.elements).toBe(3);
  });

  it("restores whatever the scene key held before it ran", () => {
    globalThis.localStorage = createMemoryStorage(60_000);
    const scene = makeStressScene({ elements: 1, pointsPerElement: 3 });
    persistScene(scene);

    floodPersist({ pointsPerElement: 20, step: 2, maxElements: 200 });

    expect(loadScene()).toEqual(scene);
  });

  it("removes the scene key again if nothing was stored before it ran", () => {
    floodPersist({ pointsPerElement: 2, step: 1, maxElements: 2 });

    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBeNull();
  });
});

describe("fillStore", () => {
  it("appends through the store, one notification per element", () => {
    const store = createSceneStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    const result = fillStore(store, { elements: 6, pointsPerElement: 4 });

    expect(notifications).toBe(6);
    expect(store.getScene()).toHaveLength(6);
    expect(result.elements).toBe(6);
    expect(result.points).toBe(24);
  });

  it("appends to a scene that is already there", () => {
    const seed: Scene = makeStressScene({ elements: 2, pointsPerElement: 3 });
    const store = createSceneStore([...seed]);

    fillStore(store, { elements: 3, pointsPerElement: 3 });

    expect(store.getScene()).toHaveLength(5);
    expect(store.getScene().slice(0, 2)).toEqual(seed);
  });

  it("counts what a persist-on-every-notification subscriber writes", () => {
    const store = createSceneStore();

    const result = fillStore(store, { elements: 5, pointsPerElement: 4 });

    // What an uncoalesced subscriber would have written: the whole scene, once
    // per append. Recomputed here from the prefixes, independently.
    const scene = store.getScene();
    let expected = 0;
    for (let n = 1; n <= scene.length; n += 1) {
      expected += JSON.stringify(scene.slice(0, n)).length;
    }

    expect(result.charsWritten).toBe(expected);
  });

  it("writes quadratically — the cost is not n final scenes, it is far more", () => {
    const store = createSceneStore();

    const result = fillStore(store, { elements: 10, pointsPerElement: 4 });

    // Every append re-serialises everything before it, so the total lands near
    // half of n × the final size — not one final size, and not n of them.
    expect(result.charsWritten).toBeGreaterThan(result.chars * 4);
    expect(result.charsWritten).toBeLessThan(result.chars * 10);
  });
});

describe("corruptStoredScene", () => {
  it("writes }{ for malformed — not JSON at all", () => {
    corruptStoredScene("malformed");

    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBe("}{");
  });

  it("writes a valid element with a type the renderer has no case for", () => {
    corruptStoredScene("unknown-type");

    const raw = localStorage.getItem(SCENE_STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    // The lesson: valid JSON and a plausible element, which loadScene's cast
    // waves straight through. What happens next is a finding, not a test.
    expect(parsed[0].type).toBe("triangle");
  });

  it("writes the envelope shape a future version would write", () => {
    corruptStoredScene("wrong-shape");

    const parsed = JSON.parse(localStorage.getItem(SCENE_STORAGE_KEY)!);
    // Indistinguishable from corruption, because there is no version field.
    expect(Array.isArray(parsed)).toBe(false);
    expect(Array.isArray(parsed.elements)).toBe(true);
  });

  it("writes exactly the documented literals", () => {
    for (const [kind, raw] of Object.entries(CORRUPTIONS)) {
      corruptStoredScene(kind as keyof typeof CORRUPTIONS);
      expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBe(raw);
    }
  });
});

describe("clearStoredScene", () => {
  it("removes the key, so the next load starts empty", () => {
    persistScene(makeStressScene({ elements: 1, pointsPerElement: 3 }));

    clearStoredScene();

    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBeNull();
    expect(loadScene()).toEqual([]);
  });
});
