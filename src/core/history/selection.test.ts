import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE, type RectangleElement } from "@core/scene";
import { getEntrySelection } from "./selection";

const aRectangle = (id: string, x = 0): RectangleElement => ({
  id,
  type: "rectangle",
  x,
  y: 0,
  width: 10,
  height: 10,
  style: { ...DEFAULT_STYLE },
});

describe("getEntrySelection", () => {
  it("selects the element a single operation touched when it is in the scene", () => {
    const entry = { kind: "add" as const, element: aRectangle("a"), index: 0 };

    expect(getEntrySelection(entry, [aRectangle("a")])).toBe("a");
  });

  it("selects nothing when that element is not in the scene", () => {
    const entry = { kind: "remove" as const, element: aRectangle("a"), index: 0 };

    expect(getEntrySelection(entry, [aRectangle("b")])).toBeNull();
  });

  describe("for a compound", () => {
    const eraseOfAAndB = {
      kind: "compound" as const,
      operations: [
        { kind: "remove" as const, element: aRectangle("a"), index: 0 },
        { kind: "remove" as const, element: aRectangle("b"), index: 0 },
      ],
    };

    it("selects the one touched element in the scene", () => {
      expect(getEntrySelection(eraseOfAAndB, [aRectangle("a"), aRectangle("c")])).toBe("a");
    });

    it("selects nothing when none of them is in the scene", () => {
      expect(getEntrySelection(eraseOfAAndB, [aRectangle("c")])).toBeNull();
    });

    it("selects nothing when several of them are in the scene", () => {
      const scene = [aRectangle("a"), aRectangle("b"), aRectangle("c")];

      expect(getEntrySelection(eraseOfAAndB, scene)).toBeNull();
    });

    it("counts an element two operations touched only once", () => {
      // Drawn, then moved: one element, so it is the one to select.
      const drawAndMove = {
        kind: "compound" as const,
        operations: [
          { kind: "add" as const, element: aRectangle("a", 0), index: 0 },
          { kind: "replace" as const, before: aRectangle("a", 0), after: aRectangle("a", 50) },
        ],
      };

      expect(getEntrySelection(drawAndMove, [aRectangle("a", 50)])).toBe("a");
    });
  });
});
