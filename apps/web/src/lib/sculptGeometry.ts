import * as THREE from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import type { WorkplaneShape } from "@/types/sketchforge";

export const SCULPT_EDGE_TRIANGLE_LIMIT = 40_000;
export const SCULPT_SELECTED_EDGE_ANGLE = 60;
type MeshData = NonNullable<WorkplaneShape["importedMesh"]>;

export type SculptGeometryBuffers = {
  positions: Float32Array;
  normals: Float32Array;
  bounds: [number, number, number, number, number, number];
  sphere: [number, number, number, number];
  bvh: SerializedBVH;
  edges: Array<{ angle: number; positions: Float32Array }>;
};

/** Worker-only preparation. All full-mesh scans and tree construction live here. */
export function prepareSculptGeometry(mesh: MeshData): SculptGeometryBuffers {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  if (mesh.normals?.length === mesh.positions.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingSphere();
  const bvh = new MeshBVH(geometry, { targetLeafSize: 12 });
  const edges = mesh.triangleCount <= SCULPT_EDGE_TRIANGLE_LIMIT
    ? [SCULPT_SELECTED_EDGE_ANGLE, 14].map((angle) => {
      const outline = new THREE.EdgesGeometry(geometry, angle);
      return { angle, positions: outline.getAttribute("position").array as Float32Array };
    })
    : [];
  const box = geometry.boundingBox!;
  const sphere = geometry.boundingSphere!;
  return {
    positions: geometry.getAttribute("position").array as Float32Array,
    normals: geometry.getAttribute("normal").array as Float32Array,
    bounds: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z],
    sphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius],
    bvh: MeshBVH.serialize(bvh, { cloneBuffers: false }),
    edges,
  };
}

/** Attach transferred buffers directly; do not recompute, copy, or index the mesh. */
export function restoreSculptGeometry(buffers: SculptGeometryBuffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3));
  const [minX, minY, minZ, maxX, maxY, maxZ] = buffers.bounds;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  const [x, y, z, radius] = buffers.sphere;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), radius);
  geometry.boundsTree = MeshBVH.deserialize(buffers.bvh, geometry);
  geometry.userData.cached = true;
  geometry.userData.sculptGenerated = true;
  const edges = new Map<number, THREE.EdgesGeometry>();
  for (const outline of buffers.edges) {
    const edgeGeometry = new THREE.EdgesGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(outline.positions, 3));
    edgeGeometry.userData.cached = true;
    edgeGeometry.userData.sculptGenerated = true;
    edges.set(outline.angle, edgeGeometry);
  }
  return { geometry, edges };
}

export function sculptGeometryTransferables(buffers: SculptGeometryBuffers): ArrayBuffer[] {
  return [...new Set([
    buffers.positions.buffer,
    buffers.normals.buffer,
    ...buffers.bvh.roots,
    ...(buffers.bvh.index ? [buffers.bvh.index.buffer] : []),
    ...(buffers.bvh.indirectBuffer ? [buffers.bvh.indirectBuffer.buffer] : []),
    ...buffers.edges.map((edge) => edge.positions.buffer),
  ])] as ArrayBuffer[];
}

export function retainSculptGeometry(geometry: THREE.BufferGeometry) {
  if (geometry.userData.sculptGenerated) {
    geometry.userData.sculptUsers = (geometry.userData.sculptUsers ?? 0) + 1;
  }
}

export function releaseSculptGeometry(geometry: THREE.BufferGeometry) {
  const data = geometry.userData;
  if (!data.sculptGenerated || !data.sculptUsers) return;
  data.sculptUsers -= 1;
  // Retain CPU data for undo/cache reuse, but free superseded GPU allocations.
  if (data.sculptUsers === 0) geometry.dispose();
}
