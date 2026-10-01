import { describe, expect, it } from "vitest";
import { validateDocument } from "./validate";

const style = { strokeColor: "#1e1e1e", fillColor: "transparent", strokeWidth: 2 };

const rectangle = { id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 20, style };
const ellipse = { id: "e", type: "ellipse", x: 5, y: -5, width: 30, height: 15, style };
const freehand = {
  id: "f",
  type: "freehand",
  x: 1,
  y: 2,
  points: [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
  ],
  style,
};

const envelope = (elements: unknown[]) => ({ version: 1, elements });

/** A valid document with one field of one element replaced. */
function withElement(element: Record<string, unknown>) {
  return envelope([rectangle, element]);
}

function invalidAt(path: string) {
  return { ok: false, reason: "invalid", path };
}

describe("validateDocument — valid documents", () => {
  it.each([
    ["rectangle", rectangle],
    ["ellipse", ellipse],
    ["freehand", freehand],
  ])("accepts a document holding a %s", (_, element) => {
    const document = envelope([element]);

    expect(validateDocument(document)).toEqual({
      ok: true,
      scene: [element],
    });
  });

  it("accepts an empty scene", () => {
    expect(validateDocument(envelope([]))).toEqual({ ok: true, scene: [] });
  });

  it("keeps array order, which is z-order", () => {
    const result = validateDocument(envelope([freehand, rectangle, ellipse]));

    expect(result.ok && result.scene.map((element) => element.id)).toEqual([
      "f",
      "r",
      "e",
    ]);
  });

  it("ignores unknown extra fields, on the envelope and on elements", () => {
    const document = {
      ...envelope([{ ...rectangle, locked: true, style: { ...style, opacity: 1 } }]),
      savedBy: "a newer minor build",
    };

    expect(validateDocument(document).ok).toBe(true);
  });

  it("does not parse colours as CSS", () => {
    const element = { ...rectangle, style: { ...style, strokeColor: "not-a-colour" } };

    expect(validateDocument(envelope([element])).ok).toBe(true);
  });

  it("accepts zero width, height and strokeWidth", () => {
    const element = { ...ellipse, width: 0, height: 0, style: { ...style, strokeWidth: 0 } };

    expect(validateDocument(envelope([element])).ok).toBe(true);
  });

  it("accepts a freehand stroke of a single point", () => {
    const element = { ...freehand, points: [{ x: 0, y: 0 }] };

    expect(validateDocument(envelope([element])).ok).toBe(true);
  });
});

describe("validateDocument — the envelope", () => {
  it.each([
    ["a bare array (the old format)", [rectangle]],
    ["null", null],
    ["a string", '{"version":1,"elements":[]}'],
    ["a number", 1],
    ["undefined", undefined],
  ])("rejects %s at the root", (_, value) => {
    expect(validateDocument(value)).toEqual(invalidAt(""));
  });

  it("reports a newer format version as not understood, not as invalid", () => {
    expect(validateDocument({ version: 2, elements: [rectangle] })).toEqual({
      ok: false,
      reason: "unknown-format-version",
      path: "version",
    });
  });

  it("does not look inside a newer format's elements", () => {
    expect(validateDocument({ version: 3, elements: "anything" })).toMatchObject({
      reason: "unknown-format-version",
    });
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["a string", "1"],
    ["a fraction", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])("rejects a version that is %s", (_, version) => {
    expect(validateDocument({ version, elements: [] })).toEqual(invalidAt("version"));
  });

  it.each([
    ["missing", undefined],
    ["an object", { 0: rectangle }],
    ["a string", "[]"],
  ])("rejects elements that are %s", (_, elements) => {
    expect(validateDocument({ version: 1, elements })).toEqual(invalidAt("elements"));
  });
});

describe("validateDocument — every element", () => {
  it.each([
    ["null", null],
    ["a string", "rectangle"],
    ["an array", [rectangle]],
  ])("rejects an element that is %s", (_, element) => {
    expect(validateDocument(envelope([rectangle, element]))).toEqual(
      invalidAt("elements[1]"),
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["a number", 7],
  ])("rejects an id that is %s", (_, id) => {
    expect(validateDocument(withElement({ ...ellipse, id }))).toEqual(
      invalidAt("elements[1].id"),
    );
  });

  it("rejects an id that is not unique across the scene, at the repeat", () => {
    const document = envelope([rectangle, ellipse, { ...freehand, id: "r" }]);

    expect(validateDocument(document)).toEqual(invalidAt("elements[2].id"));
  });

  it.each([
    ["unknown", "triangle"],
    ["missing", undefined],
    ["differently cased", "Rectangle"],
    ["inherited from Object.prototype", "constructor"],
  ])("rejects a type that is %s", (_, type) => {
    expect(validateDocument(withElement({ ...ellipse, type }))).toEqual(
      invalidAt("elements[1].type"),
    );
  });

  it.each(["x", "y"])("rejects a non-finite %s", (field) => {
    for (const value of [NaN, Infinity, -Infinity, "0", undefined]) {
      expect(validateDocument(withElement({ ...ellipse, [field]: value }))).toEqual(
        invalidAt(`elements[1].${field}`),
      );
    }
  });

  it("reports the first error when an element has several", () => {
    const element = { ...ellipse, id: "", type: "triangle", x: NaN };

    expect(validateDocument(withElement(element))).toEqual(invalidAt("elements[1].id"));
  });

  it("reports the first bad element when several are bad", () => {
    const document = envelope([rectangle, { ...ellipse, x: NaN }, { ...freehand, type: "?" }]);

    expect(validateDocument(document)).toEqual(invalidAt("elements[1].x"));
  });
});

describe("validateDocument — rectangle and ellipse geometry", () => {
  it.each([
    ["rectangle", rectangle],
    ["ellipse", ellipse],
  ])("rejects a %s with bad width or height", (_, element) => {
    for (const field of ["width", "height"]) {
      for (const value of [-1, NaN, Infinity, "10", undefined]) {
        expect(validateDocument(withElement({ ...element, id: "x", [field]: value }))).toEqual(
          invalidAt(`elements[1].${field}`),
        );
      }
    }
  });
});

describe("validateDocument — freehand points", () => {
  it.each([
    ["missing", undefined],
    ["empty", []],
    ["an object", { 0: { x: 0, y: 0 } }],
  ])("rejects points that are %s", (_, points) => {
    expect(validateDocument(withElement({ ...freehand, points }))).toEqual(
      invalidAt("elements[1].points"),
    );
  });

  it("rejects a point that is not an object", () => {
    const points = [{ x: 0, y: 0 }, null];

    expect(validateDocument(withElement({ ...freehand, points }))).toEqual(
      invalidAt("elements[1].points[1]"),
    );
  });

  it.each(["x", "y"])("rejects a point with a non-finite %s", (field) => {
    for (const value of [NaN, Infinity, "1", undefined]) {
      const points = [{ x: 0, y: 0 }, { x: 1, y: 1, [field]: value }];

      expect(validateDocument(withElement({ ...freehand, points }))).toEqual(
        invalidAt(`elements[1].points[1].${field}`),
      );
    }
  });
});

describe("validateDocument — style", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["a string", "#000"],
  ])("rejects a style that is %s", (_, value) => {
    expect(validateDocument(withElement({ ...ellipse, style: value }))).toEqual(
      invalidAt("elements[1].style"),
    );
  });

  it.each(["strokeColor", "fillColor"])("rejects a non-string %s", (field) => {
    const element = { ...ellipse, style: { ...style, [field]: 0 } };

    expect(validateDocument(withElement(element))).toEqual(
      invalidAt(`elements[1].style.${field}`),
    );
  });

  it.each([
    ["negative", -1],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a string", "2"],
  ])("rejects a strokeWidth that is %s", (_, strokeWidth) => {
    const element = { ...ellipse, style: { ...style, strokeWidth } };

    expect(validateDocument(withElement(element))).toEqual(
      invalidAt("elements[1].style.strokeWidth"),
    );
  });
});
