import type { WorkplaneShape } from "@/types/sketchforge";

export type SculptBrushKind = "add" | "subtract" | "smooth";

export type SculptBrushSettings = {
  kind: SculptBrushKind;
  radius: number;
  strength: number;
};

export type SculptPoint = { x: number; y: number; z: number };

const WELD_TOLERANCE = 1e-5;
const MIN_DIMENSION = 0.001;
const REMESH_EDGE_DIVISIONS = 4;
const MAX_REMESH_PASSES = 5;
const MAX_REMESH_TRIANGLES = 200_000;

type Triangle = [number, number, number];

function weldKey(x: number, y: number, z: number) {
  return `${Math.round(x / WELD_TOLERANCE)},${Math.round(y / WELD_TOLERANCE)},${Math.round(z / WELD_TOLERANCE)}`;
}

function normalize(vector: SculptPoint) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length > 1e-10
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : { x: 0, y: 1, z: 0 };
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function pointSegmentDistanceSquared(point: SculptPoint, a: SculptPoint, b: SculptPoint) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;
  const lengthSquared = abX * abX + abY * abY + abZ * abZ;
  if (lengthSquared <= 1e-20) {
    return (point.x - a.x) ** 2 + (point.y - a.y) ** 2 + (point.z - a.z) ** 2;
  }
  const projection = Math.max(0, Math.min(1, (
    (point.x - a.x) * abX + (point.y - a.y) * abY + (point.z - a.z) * abZ
  ) / lengthSquared));
  const x = a.x + abX * projection;
  const y = a.y + abY * projection;
  const z = a.z + abZ * projection;
  return (point.x - x) ** 2 + (point.y - y) ** 2 + (point.z - z) ** 2;
}

function pointTriangleDistanceSquared(point: SculptPoint, a: SculptPoint, b: SculptPoint, c: SculptPoint) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const ap = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z };
  const dot = (left: SculptPoint, right: SculptPoint) => left.x * right.x + left.y * right.y + left.z * right.z;
  const distanceSquared = (left: SculptPoint, right: SculptPoint) => (
    (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2
  );
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return distanceSquared(point, a);

  const bp = { x: point.x - b.x, y: point.y - b.y, z: point.z - b.z };
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return distanceSquared(point, b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const scale = d1 / (d1 - d3);
    return distanceSquared(point, { x: a.x + ab.x * scale, y: a.y + ab.y * scale, z: a.z + ab.z * scale });
  }

  const cp = { x: point.x - c.x, y: point.y - c.y, z: point.z - c.z };
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return distanceSquared(point, c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const scale = d2 / (d2 - d6);
    return distanceSquared(point, { x: a.x + ac.x * scale, y: a.y + ac.y * scale, z: a.z + ac.z * scale });
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const scale = (d4 - d3) / (d4 - d3 + d5 - d6);
    return distanceSquared(point, {
      x: b.x + (c.x - b.x) * scale,
      y: b.y + (c.y - b.y) * scale,
      z: b.z + (c.z - b.z) * scale,
    });
  }

  const total = va + vb + vc;
  if (Math.abs(total) <= 1e-20) {
    return Math.min(
      pointSegmentDistanceSquared(point, a, b),
      pointSegmentDistanceSquared(point, b, c),
      pointSegmentDistanceSquared(point, c, a),
    );
  }
  const inverse = 1 / total;
  const abScale = vb * inverse;
  const acScale = vc * inverse;
  return distanceSquared(point, {
    x: a.x + ab.x * abScale + ac.x * acScale,
    y: a.y + ab.y * abScale + ac.y * acScale,
    z: a.z + ab.z * abScale + ac.z * acScale,
  });
}

function remeshSculptRegion(
  sourceVertices: SculptPoint[],
  sourceTriangles: Triangle[],
  point: SculptPoint,
  radius: number,
) {
  const vertices = sourceVertices.map((vertex) => ({ ...vertex }));
  let triangles = sourceTriangles.map((triangle) => [...triangle] as Triangle);
  const targetEdgeSquared = (radius / REMESH_EDGE_DIVISIONS) ** 2;
  const radiusSquared = radius * radius;
  const triangleLimit = Math.max(
    triangles.length,
    Math.min(MAX_REMESH_TRIANGLES, triangles.length + Math.max(2048, triangles.length * 2)),
  );

  for (let pass = 0; pass < MAX_REMESH_PASSES && triangles.length < triangleLimit; pass += 1) {
    const candidates = new Map<string, { a: number; b: number; distanceSquared: number; lengthSquared: number; uses: number; eligible: boolean }>();
    const registerEdge = (a: number, b: number, triangleIntersectsBrush: boolean) => {
      if (a === b) return;
      const start = vertices[a];
      const end = vertices[b];
      const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2 + (end.z - start.z) ** 2;
      const distanceSquared = pointSegmentDistanceSquared(point, start, end);
      const key = edgeKey(a, b);
      const existing = candidates.get(key);
      if (existing) {
        existing.uses += 1;
        existing.eligible ||= triangleIntersectsBrush || distanceSquared < radiusSquared;
      } else {
        candidates.set(key, {
          a,
          b,
          distanceSquared,
          lengthSquared,
          uses: 1,
          eligible: triangleIntersectsBrush || distanceSquared < radiusSquared,
        });
      }
    };
    triangles.forEach(([a, b, c]) => {
      const triangleIntersectsBrush = pointTriangleDistanceSquared(point, vertices[a], vertices[b], vertices[c]) < radiusSquared;
      registerEdge(a, b, triangleIntersectsBrush);
      registerEdge(b, c, triangleIntersectsBrush);
      registerEdge(c, a, triangleIntersectsBrush);
    });
    const eligibleCandidates = [...candidates.entries()].filter(([, candidate]) => (
      candidate.eligible && candidate.lengthSquared > targetEdgeSquared
    ));
    if (eligibleCandidates.length === 0) break;

    const selectedEdges = new Set<string>();
    let availableTriangles = triangleLimit - triangles.length;
    eligibleCandidates
      .sort(([, left], [, right]) => left.distanceSquared - right.distanceSquared || right.lengthSquared - left.lengthSquared)
      .forEach(([key, candidate]) => {
        // Splitting an edge adds one triangle for every face that uses it.
        if (candidate.uses > availableTriangles) return;
        selectedEdges.add(key);
        availableTriangles -= candidate.uses;
      });
    if (selectedEdges.size === 0) break;

    const midpointByEdge = new Map<string, number>();
    selectedEdges.forEach((key) => {
      const candidate = candidates.get(key)!;
      const start = vertices[candidate.a];
      const end = vertices[candidate.b];
      midpointByEdge.set(key, vertices.length);
      vertices.push({
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        z: (start.z + end.z) / 2,
      });
    });

    const nextTriangles: Triangle[] = [];
    triangles.forEach(([a, b, c]) => {
      const ab = midpointByEdge.get(edgeKey(a, b));
      const bc = midpointByEdge.get(edgeKey(b, c));
      const ca = midpointByEdge.get(edgeKey(c, a));
      if (ab === undefined && bc === undefined && ca === undefined) {
        nextTriangles.push([a, b, c]);
      } else if (ab !== undefined && bc === undefined && ca === undefined) {
        nextTriangles.push([a, ab, c], [ab, b, c]);
      } else if (ab === undefined && bc !== undefined && ca === undefined) {
        nextTriangles.push([b, bc, a], [bc, c, a]);
      } else if (ab === undefined && bc === undefined && ca !== undefined) {
        nextTriangles.push([c, ca, b], [ca, a, b]);
      } else if (ab !== undefined && bc !== undefined && ca === undefined) {
        nextTriangles.push([b, bc, ab], [a, ab, bc], [a, bc, c]);
      } else if (ab === undefined && bc !== undefined && ca !== undefined) {
        nextTriangles.push([c, ca, bc], [b, bc, ca], [b, ca, a]);
      } else if (ab !== undefined && bc === undefined && ca !== undefined) {
        nextTriangles.push([a, ab, ca], [c, ca, ab], [c, ab, b]);
      } else {
        nextTriangles.push([a, ab!, ca!], [ab!, b, bc!], [ca!, bc!, c], [ab!, bc!, ca!]);
      }
    });
    triangles = nextTriangles;
  }

  return { vertices, triangles };
}

function smoothRemeshedVertices(
  vertices: SculptPoint[],
  triangles: Triangle[],
  point: SculptPoint,
  radius: number,
  strength: number,
) {
  const neighbors = vertices.map(() => new Set<number>());
  const edgeUses = new Map<string, { a: number; b: number; count: number }>();
  triangles.forEach(([a, b, c]) => {
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
    [[a, b], [b, c], [c, a]].forEach(([start, end]) => {
      const key = edgeKey(start, end);
      const edge = edgeUses.get(key);
      if (edge) edge.count += 1;
      else edgeUses.set(key, { a: start, b: end, count: 1 });
    });
  });
  const pinned = new Set<number>();
  edgeUses.forEach(({ a, b, count }) => {
    if (count !== 2) pinned.add(a).add(b);
  });

  const relax = (source: SculptPoint[], factor: number) => source.map((vertex, index) => {
    if (pinned.has(index)) return { ...vertex };
    const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y, vertex.z - point.z);
    if (distance >= radius || neighbors[index].size === 0) return { ...vertex };
    const normalizedDistance = distance / radius;
    const falloff = (1 - normalizedDistance * normalizedDistance) ** 2;
    const average = [...neighbors[index]].reduce(
      (sum, neighbor) => ({
        x: sum.x + source[neighbor].x,
        y: sum.y + source[neighbor].y,
        z: sum.z + source[neighbor].z,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const blend = factor * falloff;
    const count = neighbors[index].size;
    return {
      x: vertex.x + (average.x / count - vertex.x) * blend,
      y: vertex.y + (average.y / count - vertex.y) * blend,
      z: vertex.z + (average.z / count - vertex.z) * blend,
    };
  });

  const lambda = Math.min(0.5, strength);
  const contracted = relax(vertices, lambda);
  // The negative Taubin pass counteracts the volume loss from Laplacian relaxation.
  return relax(contracted, -lambda * 1.06);
}

function expandedCreaseAwareNormals(vertices: SculptPoint[], triangles: Triangle[]) {
  const faceNormals = triangles.map(([a, b, c]) => normalize({
    x: (vertices[b].y - vertices[a].y) * (vertices[c].z - vertices[a].z)
      - (vertices[b].z - vertices[a].z) * (vertices[c].y - vertices[a].y),
    y: (vertices[b].z - vertices[a].z) * (vertices[c].x - vertices[a].x)
      - (vertices[b].x - vertices[a].x) * (vertices[c].z - vertices[a].z),
    z: (vertices[b].x - vertices[a].x) * (vertices[c].y - vertices[a].y)
      - (vertices[b].y - vertices[a].y) * (vertices[c].x - vertices[a].x),
  }));
  const incidentFaces = vertices.map(() => [] as number[]);
  triangles.forEach((triangle, faceIndex) => triangle.forEach((vertexIndex) => incidentFaces[vertexIndex].push(faceIndex)));

  return triangles.flatMap((triangle, faceIndex) => triangle.flatMap((vertexIndex) => {
    const faceNormal = faceNormals[faceIndex];
    const sum = incidentFaces[vertexIndex].reduce((normal, adjacentFaceIndex) => {
      const adjacent = faceNormals[adjacentFaceIndex];
      const dot = faceNormal.x * adjacent.x + faceNormal.y * adjacent.y + faceNormal.z * adjacent.z;
      if (dot >= 0.5 - 1e-8) {
        normal.x += adjacent.x;
        normal.y += adjacent.y;
        normal.z += adjacent.z;
      }
      return normal;
    }, { x: 0, y: 0, z: 0 });
    const normal = normalize(sum);
    return [normal.x, normal.y, normal.z];
  }));
}

function clearedSculptMetadata() {
  return {
    cadBrep: undefined,
    cadBrepFrame: undefined,
    cadPrimitiveFrame: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    sketchProfile: undefined,
    sketchFeature: undefined,
    sketchOperation: undefined,
    sketchRevolve: undefined,
  } satisfies Partial<WorkplaneShape>;
}

export function sculptMeshAtPoint(
  shape: Pick<WorkplaneShape, "x" | "z" | "elevation" | "importedMesh">,
  point: SculptPoint,
  settings: SculptBrushSettings,
): Partial<WorkplaneShape> | null {
  const mesh = shape.importedMesh;
  const radius = Math.max(MIN_DIMENSION, settings.radius);
  const strength = Math.max(0, settings.strength);
  if (!mesh || mesh.positions.length < 9 || strength === 0) return null;

  let vertices: SculptPoint[] = [];
  const sourceToWelded: number[] = [];
  const weldedByPosition = new Map<string, number>();
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const vertex = { x: mesh.positions[index], y: mesh.positions[index + 1], z: mesh.positions[index + 2] };
    const key = weldKey(vertex.x, vertex.y, vertex.z);
    let weldedIndex = weldedByPosition.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = vertices.length;
      weldedByPosition.set(key, weldedIndex);
      vertices.push(vertex);
    }
    sourceToWelded.push(weldedIndex);
  }

  let triangles: Triangle[] = [];
  for (let index = 0; index + 2 < sourceToWelded.length; index += 3) {
    triangles.push([sourceToWelded[index], sourceToWelded[index + 1], sourceToWelded[index + 2]]);
  }
  const remeshed = remeshSculptRegion(vertices, triangles, point, radius);
  vertices = remeshed.vertices;
  triangles = remeshed.triangles;

  const normals = vertices.map(() => ({ x: 0, y: 0, z: 0 }));
  triangles.forEach(([a, b, c]) => {
    const ab = { x: vertices[b].x - vertices[a].x, y: vertices[b].y - vertices[a].y, z: vertices[b].z - vertices[a].z };
    const ac = { x: vertices[c].x - vertices[a].x, y: vertices[c].y - vertices[a].y, z: vertices[c].z - vertices[a].z };
    const faceNormal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    [a, b, c].forEach((vertexIndex) => {
      normals[vertexIndex].x += faceNormal.x;
      normals[vertexIndex].y += faceNormal.y;
      normals[vertexIndex].z += faceNormal.z;
    });
  });

  const nextVertices = settings.kind === "smooth"
    ? smoothRemeshedVertices(vertices, triangles, point, radius, strength)
    : vertices.map((vertex, index) => {
      const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y, vertex.z - point.z);
      if (distance >= radius) return { ...vertex };
      const normalizedDistance = distance / radius;
      const falloff = (1 - normalizedDistance * normalizedDistance) ** 2;
      const normal = normalize(normals[index]);
      const amount = strength * falloff * (settings.kind === "subtract" ? -1 : 1);
      return { x: vertex.x + normal.x * amount, y: vertex.y + normal.y * amount, z: vertex.z + normal.z * amount };
    });

  const expanded = triangles.flatMap((triangle) => triangle.map((index) => nextVertices[index]));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  expanded.forEach((vertex) => {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  });
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(MIN_DIMENSION, maxX - minX);
  const height = Math.max(MIN_DIMENSION, maxY - minY);
  const depth = Math.max(MIN_DIMENSION, maxZ - minZ);
  const positions = expanded.flatMap((vertex) => [vertex.x - centerX, vertex.y - minY, vertex.z - centerZ]);
  const outputNormals = settings.kind === "smooth" ? expandedCreaseAwareNormals(nextVertices, triangles) : undefined;

  return {
    kind: "mesh",
    x: shape.x + centerX,
    z: shape.z + centerZ,
    elevation: (shape.elevation ?? 0) + minY,
    width,
    height,
    depth,
    size: Math.max(width, depth),
    sculpted: true,
    importedMesh: {
      positions,
      ...(outputNormals ? { normals: outputNormals } : {}),
      baseWidth: width,
      baseHeight: height,
      baseDepth: depth,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    ...clearedSculptMetadata(),
  };
}
