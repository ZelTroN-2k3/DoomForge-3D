import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OcctKernel } from "occt-wasm";
import { closedCadSolidComponents } from "@/lib/cadModifierGroups";

async function kernel() {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  return OcctKernel.init({ wasm });
}

describe("grouped CAD modifier topology (real OCCT kernel)", () => {
  it("resolves overlapping fused boxes to one closed solid", async () => {
    const cad = await kernel();
    const left = cad.makeBoxFromCorners({ x: -5, y: 0, z: -5 }, { x: 5, y: 10, z: 5 });
    const right = cad.makeBoxFromCorners({ x: 0, y: 0, z: -5 }, { x: 10, y: 10, z: 5 });
    const fused = cad.unifySameDomain(cad.simplify(cad.fuse(left, right)));
    const components = closedCadSolidComponents(
      fused,
      (shape) => cad.isSolid(shape),
      (shape) => cad.getSubShapes(shape, "solid"),
    );

    expect(cad.getShapeType(fused)).toBe("compound");
    expect(components).toHaveLength(1);
    expect(cad.isSolid(components[0])).toBe(true);
    expect(cad.isValid(components[0])).toBe(true);
    cad.releaseAll();
  });

  it("preserves separate solid components for non-overlapping boxes", async () => {
    const cad = await kernel();
    const left = cad.makeBoxFromCorners({ x: -5, y: 0, z: -5 }, { x: 5, y: 10, z: 5 });
    const right = cad.makeBoxFromCorners({ x: 10, y: 0, z: -5 }, { x: 20, y: 10, z: 5 });
    const fused = cad.unifySameDomain(cad.simplify(cad.fuse(left, right)));
    const components = closedCadSolidComponents(
      fused,
      (shape) => cad.isSolid(shape),
      (shape) => cad.getSubShapes(shape, "solid"),
    );

    expect(components).toHaveLength(2);
    expect(components.every((shape) => cad.isSolid(shape) && cad.isValid(shape))).toBe(true);
    cad.releaseAll();
  });

  it("preserves a subtracted hole when resolving the fused body", async () => {
    const cad = await kernel();
    const left = cad.makeBoxFromCorners({ x: -5, y: 0, z: -5 }, { x: 5, y: 10, z: 5 });
    const right = cad.makeBoxFromCorners({ x: 0, y: 0, z: -5 }, { x: 10, y: 10, z: 5 });
    const cutter = cad.makeBoxFromCorners({ x: 2, y: 2, z: -2 }, { x: 4, y: 8, z: 2 });
    const cut = cad.unifySameDomain(cad.simplify(cad.cut(cad.fuse(left, right), cutter)));
    const components = closedCadSolidComponents(
      cut,
      (shape) => cad.isSolid(shape),
      (shape) => cad.getSubShapes(shape, "solid"),
    );

    expect(components).toHaveLength(1);
    expect(cad.isSolid(components[0])).toBe(true);
    expect(cad.getVolume(components[0])).toBeCloseTo(1452, 5);
    cad.releaseAll();
  });
});
