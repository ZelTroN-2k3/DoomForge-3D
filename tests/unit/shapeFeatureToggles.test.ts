import { describe, expect, it } from "vitest";
import { removeShapeFeature, shapeFeatureEnabled, shapeFeatureKinds, shapeWithFeatureToggles, withShapeFeatureEnabled } from "@/lib/shapeFeatureToggles";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    ...overrides,
  };
}

describe("shape feature toggles", () => {
  it("records suppression without removing feature data", () => {
    const source = box({ sketchProfile: { points: [], segments: [] }, sketchOperation: "extrude" });
    const suppressed = withShapeFeatureEnabled(source, "sketch", false);

    expect(shapeFeatureEnabled(suppressed, "sketch")).toBe(false);
    expect(suppressed.sketchProfile).toBe(source.sketchProfile);
    expect(shapeWithFeatureToggles(suppressed).hidden).toBe(true);
    expect(withShapeFeatureEnabled(suppressed, "sketch", true).disabledFeatures).toBeUndefined();
  });

  it("restores the pre-sculpt source while retaining the current transform and state", () => {
    const source = box({ width: 10, depth: 12, height: 8 });
    const sculpted = box({
      kind: "mesh",
      x: 9,
      z: 7,
      width: 22,
      depth: 23,
      height: 24,
      sculpted: true,
      sculptSource: source,
      importedMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 1, sourceFormat: "json" },
      disabledFeatures: ["sculpt"],
    });
    const effective = shapeWithFeatureToggles(sculpted);

    expect(effective.kind).toBe("box");
    expect(effective.importedMesh).toBeUndefined();
    expect(effective.x).toBe(9);
    expect(effective.width).toBe(22);
  });

  it("restores grouped operands by suppressing the generated result mesh", () => {
    const grouped = box({
      kind: "mesh",
      groupedShapes: [box({ id: "child-a" }), box({ id: "child-b", x: 10 })],
      importedMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 1, sourceFormat: "json" },
      disabledFeatures: ["group"],
    });

    expect(shapeFeatureKinds(grouped)).toContain("group");
    expect(shapeWithFeatureToggles(grouped).importedMesh).toBeUndefined();
    expect(shapeWithFeatureToggles(grouped).groupedShapes).toHaveLength(2);
  });

  it("uses stored edge history when fillet or chamfer features are suppressed", () => {
    const before = box({ kind: "box" });
    const treated = box({
      kind: "mesh",
      importedMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 1, sourceFormat: "json" },
      edgeTreatments: [{ kind: "fillet", amount: 2, edgeCount: 4 }],
      edgeTreatmentHistory: [{ id: "fillet-1", createdAt: 1, feature: { kind: "fillet", amount: 2, edgeCount: 4 }, before }],
      disabledFeatures: ["edge"],
    });

    expect(shapeFeatureKinds(treated)).toContain("edge");
    expect(shapeWithFeatureToggles(treated).kind).toBe("box");
    expect(shapeWithFeatureToggles(treated).importedMesh).toBeUndefined();
  });

  it("permanently removes edge history while preserving unrelated suppression", () => {
    const before = box({ width: 12, depth: 14, height: 16 });
    const treated = box({
      kind: "mesh",
      importedMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 1, sourceFormat: "json" },
      edgeTreatments: [{ kind: "fillet", amount: 2, edgeCount: 4 }],
      edgeTreatmentHistory: [{ id: "fillet-1", createdAt: 1, feature: { kind: "fillet", amount: 2, edgeCount: 4 }, before }],
      disabledFeatures: ["edge", "sketch"],
    });
    const removal = removeShapeFeature(treated, "edge");

    expect(removal?.type).toBe("replace");
    if (removal?.type !== "replace") throw new Error("Expected a replacement shape");
    expect(removal.shape.kind).toBe("box");
    expect(removal.shape.width).toBe(12);
    expect(removal.shape.edgeTreatments).toBeUndefined();
    expect(removal.shape.edgeTreatmentHistory).toBeUndefined();
    expect(removal.shape.disabledFeatures).toEqual(["sketch"]);
  });

  it("restores and unlinks the pre-sculpt source without shrinking its current frame", () => {
    const source = box({ width: 10, depth: 12, height: 8 });
    const sculpted = box({
      kind: "mesh",
      x: 9,
      z: 7,
      width: 22,
      depth: 23,
      height: 24,
      sculpted: true,
      sculptSource: source,
      importedMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 1, sourceFormat: "json" },
      disabledFeatures: ["sculpt", "group"],
    });
    const removal = removeShapeFeature(sculpted, "sculpt");

    expect(removal?.type).toBe("replace");
    if (removal?.type !== "replace") throw new Error("Expected a replacement shape");
    expect(removal.shape.kind).toBe("box");
    expect(removal.shape.x).toBe(9);
    expect(removal.shape.width).toBe(22);
    expect(removal.shape.sculpted).toBeUndefined();
    expect(removal.shape.sculptSource).toBeUndefined();
    expect(removal.shape.disabledFeatures).toEqual(["group"]);
  });

  it("plans model deletion for sketch output and ungrouping for group results", () => {
    const sketch = box({ sketchProfile: { points: [], segments: [] }, sketchOperation: "extrude" });
    const group = box({ groupedShapes: [box({ id: "child-a" }), box({ id: "child-b" })] });

    expect(removeShapeFeature(sketch, "sketch")).toEqual({ type: "delete-shape" });
    expect(removeShapeFeature(group, "group")).toEqual({ type: "ungroup" });
    expect(removeShapeFeature(box(), "edge")).toBeNull();
  });
});
