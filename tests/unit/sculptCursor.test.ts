import { describe, expect, it } from "vitest";
import { sculptBrushRing } from "@/lib/sculptCursor";

describe("sculptBrushRing", () => {
  it("places every sample at the brush radius in the surface plane", () => {
    const center = { x: 2, y: 3, z: 4 };
    const normal = { x: 1, y: 2, z: 3 };
    const normalLength = Math.hypot(normal.x, normal.y, normal.z);
    const ring = sculptBrushRing(center, normal, 5, 32);

    expect(ring).toHaveLength(32);
    ring.forEach((point) => {
      const offset = { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
      expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(5);
      expect((offset.x * normal.x + offset.y * normal.y + offset.z * normal.z) / normalLength).toBeCloseTo(0);
    });
  });

  it("stays stable for axis-aligned and degenerate normals", () => {
    [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }].forEach((normal) => {
      const ring = sculptBrushRing({ x: 0, y: 0, z: 0 }, normal, 2);
      expect(ring).toHaveLength(40);
      ring.forEach((point) => {
        expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(2);
      });
    });
  });
});
