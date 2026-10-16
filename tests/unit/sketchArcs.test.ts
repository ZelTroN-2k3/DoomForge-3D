import { describe, expect, it } from "vitest";
import { appendSketchArc, arcFromThreePoints, arcSketchGeometry } from "../../apps/web/src/lib/sketchArcs";
import { cadSketchRegions, orderedCadSketchPaths } from "../../apps/web/src/lib/sketchCadProfile";

describe("three-point arcs", () => {
  it.each([false, true])("welds two arcs into a closed region without distorting either curve (reverse %s)", (reverse) => {
    const left = { x: -10, z: 0 };
    const right = { x: 10, z: 0 };
    const upper = arcSketchGeometry(arcFromThreePoints(left, right, { x: 0, z: -10 })!);
    const original = structuredClone(upper);
    const lower = arcSketchGeometry(arcFromThreePoints(reverse ? right : left, reverse ? left : right, { x: 0, z: 10 })!);
    const joined = appendSketchArc(upper, lower);
    expect(upper).toEqual(original);
    expect(joined.points).toHaveLength(upper.points.length + lower.points.length - 2);
    expect(orderedCadSketchPaths(joined)).toHaveLength(1);
    expect(orderedCadSketchPaths(joined)[0]!.closed).toBe(true);
    expect(cadSketchRegions(joined)).toHaveLength(1);
    // Every original cubic must survive, allowing reversal of its direction.
    for (const source of [upper, lower]) {
      for (const segment of source.segments) {
        const beforeStart = source.points.find((p) => p.id === segment.startId)!;
        const beforeEnd = source.points.find((p) => p.id === segment.endId)!;
        const updated = joined.segments.find((s) => s.id === segment.id)!;
        const start = joined.points.find((p) => p.id === updated.startId)!;
        const end = joined.points.find((p) => p.id === updated.endId)!;
        const forward = start.x === beforeStart.x && start.z === beforeStart.z;
        expect(start.handleOut).toEqual(forward ? beforeStart.handleOut : beforeEnd.handleIn);
        expect(end.handleIn).toEqual(forward ? beforeEnd.handleIn : beforeStart.handleOut);
      }
    }
  });

  it("closes an existing straight edge with an arc", () => {
    const profile = { points: [{ id: "a", x: -10, z: 0 }, { id: "b", x: 10, z: 0 }], segments: [{ id: "line", startId: "a", endId: "b", kind: "line" as const }] };
    const joined = appendSketchArc(profile, arcSketchGeometry(arcFromThreePoints(profile.points[0]!, profile.points[1]!, { x: 0, z: 10 })!));
    expect(joined.points).toHaveLength(3);
    expect(orderedCadSketchPaths(joined)[0]!.closed).toBe(true);
    expect(cadSketchRegions(joined)).toHaveLength(1);
  });

  it.each([-1, 1])("passes through endpoints and the chosen bulge on side %s", (side) => {
    const start = { x: -10, z: 0 };
    const end = { x: 10, z: 0 };
    const through = { x: 0, z: side * 10 };
    const arc = arcFromThreePoints(start, end, through)!;
    expect(arc.radius).toBeCloseTo(10);
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI);
    const geometry = arcSketchGeometry(arc);
    expect(geometry.points[0]).toMatchObject(start);
    expect(geometry.points.at(-1)).toMatchObject(end);
    expect(geometry.points.some((p) => p.x === through.x && p.z === through.z)).toBe(true);
    expect(geometry.segments).toHaveLength(2);
    // Sample the actual stored cubics, not only their control points. Circular
    // approximation error should stay below 0.03% of radius, like sketch circles.
    for (let i = 0; i < geometry.segments.length; i++) {
      const a = geometry.points[i]!;
      const b = geometry.points[i + 1]!;
      for (let j = 0; j <= 20; j++) {
        const t = j / 20;
        const u = 1 - t;
        const x = u ** 3 * a.x + 3 * u * u * t * a.handleOut!.x + 3 * u * t * t * b.handleIn!.x + t ** 3 * b.x;
        const z = u ** 3 * a.z + 3 * u * u * t * a.handleOut!.z + 3 * u * t * t * b.handleIn!.z + t ** 3 * b.z;
        expect(Math.abs(Math.hypot(x - arc.center.x, z - arc.center.z) - arc.radius)).toBeLessThan(arc.radius * 0.0003);
        expect(z * side).toBeGreaterThanOrEqual(-1e-8);
      }
    }
  });

  it("supports major arcs, reversed endpoints, and translated vertical chords", () => {
    const start = { x: 100, z: 200 };
    const end = { x: 100, z: 220 };
    const through = { x: 140, z: 210 };
    const arc = arcFromThreePoints(start, end, through)!;
    const reversed = arcFromThreePoints(end, start, through)!;
    expect(Math.abs(arc.sweep)).toBeGreaterThan(Math.PI);
    expect(reversed.sweep).toBeCloseTo(-arc.sweep);
    expect(arcSketchGeometry(arc).points.at(-1)).toMatchObject(end);
  });

  it("rejects coincident, collinear, and non-finite input", () => {
    const start = { x: 0, z: 0 };
    const end = { x: 20, z: 0 };
    expect(arcFromThreePoints(start, start, { x: 10, z: 10 })).toBeNull();
    expect(arcFromThreePoints(start, end, start)).toBeNull();
    expect(arcFromThreePoints(start, end, { x: 10, z: 0 })).toBeNull();
    expect(arcFromThreePoints(start, end, { x: Infinity, z: 10 })).toBeNull();
  });
});
