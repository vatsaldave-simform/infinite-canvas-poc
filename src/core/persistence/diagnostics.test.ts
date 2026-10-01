import { describe, expect, it } from "vitest";
import { createSceneStore, type Scene } from "@core/scene";
import { fillStore, makeStressScene, measureScene } from "./diagnostics";

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
