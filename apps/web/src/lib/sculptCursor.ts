import type { SculptPoint } from "@/lib/sculptBrush";

function normalized(point: SculptPoint, fallback: SculptPoint): SculptPoint {
  const length = Math.hypot(point.x, point.y, point.z);
  return length > 1e-10
    ? { x: point.x / length, y: point.y / length, z: point.z / length }
    : fallback;
}

function cross(a: SculptPoint, b: SculptPoint): SculptPoint {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function sculptBrushRing(center: SculptPoint, surfaceNormal: SculptPoint, radius: number, segments = 40): SculptPoint[] {
  const normal = normalized(surfaceNormal, { x: 0, y: 1, z: 0 });
  const reference = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangent = normalized(cross(normal, reference), { x: 1, y: 0, z: 0 });
  const bitangent = cross(normal, tangent);
  const safeRadius = Math.max(0, radius);
  const count = Math.max(8, Math.round(segments));

  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const tangentScale = Math.cos(angle) * safeRadius;
    const bitangentScale = Math.sin(angle) * safeRadius;
    return {
      x: center.x + tangent.x * tangentScale + bitangent.x * bitangentScale,
      y: center.y + tangent.y * tangentScale + bitangent.y * bitangentScale,
      z: center.z + tangent.z * tangentScale + bitangent.z * bitangentScale,
    };
  });
}
