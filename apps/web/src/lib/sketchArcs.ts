import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

type Point = { x: number; z: number };
const TAU = Math.PI * 2;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Start, end, then a point on the desired side/bulge of the circle. */
export function arcFromThreePoints(start: Point, end: Point, through: Point) {
  if (![start, end, through].every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) return null;
  const bx = end.x - start.x;
  const bz = end.z - start.z;
  const cx = through.x - start.x;
  const cz = through.z - start.z;
  const chord = Math.hypot(bx, bz);
  const cross = bx * cz - bz * cx;
  if (chord < 1e-4 || Math.abs(cross) / chord < 1e-4) return null;
  const b2 = bx * bx + bz * bz;
  const c2 = cx * cx + cz * cz;
  const center = { x: start.x + (b2 * cz - c2 * bz) / (2 * cross), z: start.z + (bx * c2 - cx * b2) / (2 * cross) };
  const radius = Math.hypot(start.x - center.x, start.z - center.z);
  const angle = (p: Point) => Math.atan2(p.z - center.z, p.x - center.x);
  const startAngle = angle(start);
  const endDelta = positiveAngle(angle(end) - startAngle);
  const throughDelta = positiveAngle(angle(through) - startAngle);
  const sweep = throughDelta < endDelta ? endDelta : endDelta - TAU;
  const throughSweep = sweep > 0 ? throughDelta : throughDelta - TAU;
  return { start, end, through, center, radius, startAngle, sweep, throughSweep };
}

/** Match existing sketch circles: editable cubic spans of at most 90 degrees.
 * Split at the third point too, so all three clicked points lie on the result. */
export function arcSketchGeometry(
  arc: NonNullable<ReturnType<typeof arcFromThreePoints>>,
  createId: (prefix: string) => string = createLocalId,
): { points: SketchPoint[]; segments: SketchSegment[] } {
  const points: SketchPoint[] = [{ ...arc.start, id: createId("sketch-point"), mode: "split" }];
  const segments: SketchSegment[] = [];
  let angle = arc.startAngle;
  for (const [sweep, destination] of [[arc.throughSweep, arc.through], [arc.sweep - arc.throughSweep, arc.end]] as const) {
    const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const step = sweep / count;
    const handle = 4 / 3 * Math.tan(step / 4) * arc.radius;
    for (let i = 0; i < count; i++) {
      const previous = points[points.length - 1]!;
      previous.handleOut = { x: previous.x - Math.sin(angle) * handle, z: previous.z + Math.cos(angle) * handle };
      angle += step;
      const position = i === count - 1 ? destination : { x: arc.center.x + Math.cos(angle) * arc.radius, z: arc.center.z + Math.sin(angle) * arc.radius };
      const next: SketchPoint = { ...position, id: createId("sketch-point"), mode: "split", handleIn: { x: position.x + Math.sin(angle) * handle, z: position.z - Math.cos(angle) * handle } };
      points.push(next);
      segments.push({ id: createId("sketch-segment"), startId: previous.id, endId: next.id, kind: "bezier" });
    }
  }
  return { points, segments };
}

/** Weld snapped endpoints, orienting existing open paths so each curve retains
 * its own incoming/outgoing handle. Matching coordinates alone do not close a
 * sketch: its segments must refer to the same point IDs. */
export function appendSketchArc(profile: SketchProfile, arc: ReturnType<typeof arcSketchGeometry>): SketchProfile {
  const points = profile.points.map((point) => ({ ...point }));
  const segments = profile.segments.map((segment) => ({ ...segment }));
  const byId = new Map(points.map((point) => [point.id, point]));
  const incident = (id: string) => segments.filter((segment) => segment.startId === id || segment.endId === id);
  const match = (point: SketchPoint) => points.find((candidate) => !candidate.projectionId
    && Math.hypot(candidate.x - point.x, candidate.z - point.z) < 1e-4
    && incident(candidate.id).length <= 1
    && incident(candidate.id).every((segment) => !segment.projectionId));

  const orientPath = (endpoint: SketchPoint, away: boolean) => {
    const updates: { segment: SketchSegment; start: SketchPoint; end: SketchPoint; out: SketchPoint["handleOut"]; into: SketchPoint["handleIn"] }[] = [];
    let current = endpoint.id;
    const visited = new Set<string>();
    while (true) {
      const edges = incident(current).filter((segment) => !visited.has(segment.id));
      if (edges.length === 0) break;
      // Do not reorient branched or projected geometry.
      if (edges.length !== 1 || edges[0]!.projectionId) return false;
      const segment = edges[0]!;
      visited.add(segment.id);
      const next = segment.startId === current ? segment.endId : segment.startId;
      const start = byId.get(away ? current : next)!;
      const end = byId.get(away ? next : current)!;
      const forward = segment.startId === start.id;
      updates.push({ segment, start, end, out: forward ? start.handleOut : start.handleIn, into: forward ? end.handleIn : end.handleOut });
      current = next;
    }
    // Capture all old controls before assigning any, including when a whole
    // chain needs reversal. Never overwrite the controls of the adjacent span.
    for (const { segment, start, end, out, into } of updates) {
      segment.startId = start.id;
      segment.endId = end.id;
      if (segment.kind !== "line") {
        start.handleOut = out;
        end.handleIn = into;
      }
    }
    return true;
  };

  const remap = new Map<string, string>();
  const first = arc.points[0];
  const last = arc.points.at(-1);
  for (const [point, isStart] of [[first, true], [last, false]] as const) {
    if (!point) continue;
    const existing = match(point);
    if (!existing || !orientPath(existing, !isStart)) continue;
    remap.set(point.id, existing.id);
    existing.mode = "split";
    if (isStart) existing.handleOut = point.handleOut;
    else existing.handleIn = point.handleIn;
  }
  return {
    ...profile,
    points: [...points, ...arc.points.filter((point) => !remap.has(point.id))],
    segments: [...segments, ...arc.segments.map((segment) => ({ ...segment, startId: remap.get(segment.startId) ?? segment.startId, endId: remap.get(segment.endId) ?? segment.endId }))],
  };
}
