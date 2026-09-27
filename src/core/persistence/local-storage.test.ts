import { beforeEach, describe, expect, it } from "vitest";
import type {
  EllipseElement,
  FreehandElement,
  RectangleElement,
  Scene,
} from "@core/scene";
import { loadScene, persistScene, SCENE_STORAGE_KEY } from "./local-storage";

/**
 * Tests run in the node environment (ADR-0001), which has no localStorage, so
 * a minimal in-memory Storage stands in for it. Faking the global rather than
 * injecting a Storage parameter keeps the production call site naive.
 */
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

const style = {
  strokeColor: "#1e1e1e",
  fillColor: "transparent",
  strokeWidth: 2,
};

const rectangle: RectangleElement = {
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  style,
};

const ellipse: EllipseElement = {
  id: "ellipse-1",
  type: "ellipse",
  x: -30,
  y: 5.5,
  width: 80,
  height: 80,
  style: { ...style, fillColor: "#ffc9c9" },
};

const freehand: FreehandElement = {
  id: "freehand-1",
  type: "freehand",
  x: 200,
  y: 300,
  points: [
    { x: 0, y: 0 },
    { x: 4, y: -2.25 },
    { x: 9, y: 1 },
  ],
  style,
};

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe("persistScene / loadScene", () => {
  it("round-trips every element type", () => {
    const scene: Scene = [rectangle, ellipse, freehand];

    persistScene(scene);

    expect(loadScene()).toEqual(scene);
  });

  it("round-trips freehand points as relative offsets", () => {
    persistScene([freehand]);

    const [loaded] = loadScene();
    expect(loaded).toMatchObject({ type: "freehand", x: 200, y: 300 });
    // Narrow before touching `points`: the union member matters here.
    if (loaded.type !== "freehand") {
      throw new Error("expected a freehand element");
    }
    expect(loaded.points).toEqual(freehand.points);
  });

  it("preserves array order, because array order is z-order", () => {
    persistScene([rectangle, ellipse, freehand]);

    expect(loadScene().map((element) => element.id)).toEqual([
      "rect-1",
      "ellipse-1",
      "freehand-1",
    ]);
  });

  it("loads an empty scene when nothing has been persisted", () => {
    expect(loadScene()).toEqual([]);
  });

  it("persists an empty scene as [] rather than removing the key", () => {
    persistScene([]);

    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBe("[]");
    expect(loadScene()).toEqual([]);
  });

  it("does not mutate the scene it is given", () => {
    const scene: Scene = [rectangle];

    persistScene(scene);

    expect(scene).toEqual([rectangle]);
    expect(scene[0]).toBe(rectangle);
  });
});
