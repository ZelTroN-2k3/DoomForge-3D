import { describe, expect, it } from "vitest";
import { sculptMeshAtPoint } from "@/lib/sculptBrush";
import type { WorkplaneShape } from "@/types/sketchforge";

function meshShape(positions: number[]): WorkplaneShape {
  return {
    id: "mesh-1",
    name: "Test mesh",
    kind: "mesh",
    color: "#55aadd",
    x: 10,
    z: 20,
    elevation: 3,
    size: 2,
    width: 2,
    depth: 2,
    height: 1,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: 2,
      baseDepth: 2,
      baseHeight: 1,
      triangleCount: positions.length / 9,
      sourceFormat: "obj",
      assetId: "original-asset",
      brepStep: "STEP DATA",
    },
    cadBrep: "BREP DATA",
    cadDisplayEdges: [],
    edgeTreatments: [],
    sketchProfile: { points: [], segments: [], constraints: [], dimensions: [], images: [], texts: [], projections: [] },
    sketchOperation: "extrude",
  };
}

const flatSquare = [
  -1, 0, -1, 1, 0, 1, 1, 0, -1,
  -1, 0, -1, -1, 0, 1, 1, 0, 1,
];

const pyramid = [
  0, 1, 0, -1, 0, -1, 1, 0, -1,
  0, 1, 0, 1, 0, -1, 1, 0, 1,
  0, 1, 0, 1, 0, 1, -1, 0, 1,
  0, 1, 0, -1, 0, 1, -1, 0, -1,
];

describe("sculptMeshAtPoint", () => {
  it("adds along averaged normals and keeps duplicate triangle vertices welded", () => {
    const patch = sculptMeshAtPoint(meshShape(flatSquare), { x: 1, y: 0, z: 1 }, { kind: "add", radius: 0.6, strength: 0.4 });
    const positions = patch?.importedMesh?.positions ?? [];
    const raisedCornerHeights: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      if (Math.abs(positions[index] - 1) < 1e-8 && Math.abs(positions[index + 2] - 1) < 1e-8) {
        raisedCornerHeights.push(positions[index + 1]);
      }
    }

    expect(raisedCornerHeights.length).toBeGreaterThan(1);
    raisedCornerHeights.forEach((height) => expect(height).toBeCloseTo(0.4));
    expect(Math.min(...positions.filter((_value, index) => index % 3 === 1))).toBeCloseTo(0);
    expect(patch?.height).toBeCloseTo(0.4);
  });

  it("remeshes add strokes so coarse triangles deform only near the brush", () => {
    const coarseTriangle = [
      -10, 0, -10, 0, 0, 10, 10, 0, -10,
    ];
    const patch = sculptMeshAtPoint(meshShape(coarseTriangle), { x: 0, y: 0, z: 0 }, { kind: "add", radius: 1, strength: 0.5 });
    const positions = patch?.importedMesh?.positions ?? [];
    let raisedNearBrush = false;
    let longestAffectedEdge = 0;

    for (let index = 0; index < positions.length; index += 3) {
      const distance = Math.hypot(positions[index], positions[index + 2]);
      if (distance < 1 && positions[index + 1] > 0.01) raisedNearBrush = true;
      if (distance > 5) expect(positions[index + 1]).toBeCloseTo(0);
    }
    for (let index = 0; index < positions.length; index += 9) {
      const triangle = [0, 3, 6].map((offset) => ({
        x: positions[index + offset],
        y: positions[index + offset + 1],
        z: positions[index + offset + 2],
      }));
      if (!triangle.some((vertex) => vertex.y > 0.01)) continue;
      for (let edge = 0; edge < 3; edge += 1) {
        const start = triangle[edge];
        const end = triangle[(edge + 1) % 3];
        longestAffectedEdge = Math.max(longestAffectedEdge, Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z));
      }
    }

    expect(patch?.importedMesh?.triangleCount).toBeGreaterThan(1);
    expect(raisedNearBrush).toBe(true);
    expect(longestAffectedEdge).toBeLessThan(2);
  });

  it("subtracts the surface and rebases the local mesh without moving it in world space", () => {
    const patch = sculptMeshAtPoint(meshShape(flatSquare), { x: 1, y: 0, z: 1 }, { kind: "subtract", radius: 0.6, strength: 0.25 });
    const positions = patch?.importedMesh?.positions ?? [];
    const cornerHeights = (x: number, z: number) => positions.filter((_value, index) => (
      index % 3 === 1
      && Math.abs(positions[index - 1] - x) < 1e-8
      && Math.abs(positions[index + 1] - z) < 1e-8
    ));
    const lowered = cornerHeights(1, 1);
    const unchanged = cornerHeights(-1, -1);

    expect(patch?.elevation).toBeCloseTo(2.75);
    expect(lowered.length).toBeGreaterThan(1);
    expect(unchanged.length).toBeGreaterThan(1);
    lowered.forEach((height) => expect(height).toBeCloseTo(0));
    unchanged.forEach((height) => expect(height).toBeCloseTo(0.25));
  });

  it("locally remeshes and smooths without collapsing a coarse feature", () => {
    const patch = sculptMeshAtPoint(meshShape(pyramid), { x: 0, y: 1, z: 0 }, { kind: "smooth", radius: 0.5, strength: 0.5 });
    const positions = patch?.importedMesh?.positions ?? [];
    const apexHeights: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      if (Math.abs(positions[index]) < 1e-8 && Math.abs(positions[index + 2]) < 1e-8) {
        apexHeights.push(positions[index + 1]);
      }
    }

    expect(patch?.importedMesh?.triangleCount).toBeGreaterThan(4);
    expect(patch?.height).toBeGreaterThan(0.98);
    expect(patch?.height).toBeLessThan(1);
    expect(apexHeights).toHaveLength(4);
    apexHeights.forEach((height) => expect(height).toBeCloseTo(apexHeights[0]));
    expect(patch?.importedMesh?.normals).toHaveLength(positions.length);
  });

  it("limits shape loss across the repeated dabs produced by a stroke", () => {
    let shape = meshShape(pyramid);
    for (let dab = 0; dab < 12; dab += 1) {
      const patch = sculptMeshAtPoint(shape, { x: 0, y: shape.height, z: 0 }, { kind: "smooth", radius: 0.5, strength: 0.5 });
      expect(patch).not.toBeNull();
      shape = { ...shape, ...patch };
    }

    expect(shape.height).toBeGreaterThan(0.9);
  });

  it("remeshes a flat surface without changing its plane or outline", () => {
    const patch = sculptMeshAtPoint(meshShape(flatSquare), { x: 0, y: 0, z: 0 }, { kind: "smooth", radius: 2, strength: 0.5 });
    const positions = patch?.importedMesh?.positions ?? [];

    expect(patch?.importedMesh?.triangleCount).toBeGreaterThan(2);
    expect(patch?.width).toBeCloseTo(2);
    expect(patch?.depth).toBeCloseTo(2);
    for (let index = 1; index < positions.length; index += 3) {
      expect(positions[index]).toBeCloseTo(0);
    }
  });

  it("creates a new mesh resource and clears invalid exact and source metadata", () => {
    const source = meshShape(flatSquare);
    const patch = sculptMeshAtPoint(source, { x: 1, y: 0, z: 1 }, { kind: "add", radius: 0.6, strength: 0.2 });

    expect(patch?.importedMesh).not.toBe(source.importedMesh);
    expect(patch?.importedMesh?.sourceFormat).toBe("json");
    expect(patch?.importedMesh?.assetId).toBeUndefined();
    expect(patch?.importedMesh?.brepStep).toBeUndefined();
    expect(patch?.cadBrep).toBeUndefined();
    expect(patch?.cadDisplayEdges).toBeUndefined();
    expect(patch?.edgeTreatments).toBeUndefined();
    expect(patch?.sketchProfile).toBeUndefined();
    expect(patch?.sketchOperation).toBeUndefined();
    expect(patch?.sculpted).toBe(true);
  });
});
