import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { acceleratedRaycast } from "three-mesh-bvh";
import { prepareSculptGeometry, releaseSculptGeometry, restoreSculptGeometry, retainSculptGeometry, sculptGeometryTransferables } from "@/lib/sculptGeometry";

function boxMesh() {
  const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  geometry.translate(0, 1, 0);
  return { positions: Array.from(geometry.getAttribute("position").array), baseWidth: 2, baseHeight: 2, baseDepth: 2, triangleCount: 12, sourceFormat: "json" as const };
}

afterEach(() => vi.restoreAllMocks());

describe("worker-prepared sculpt rendering", () => {
  it("transfers buffers without copies or main-thread geometry scans", () => {
    const prepared = prepareSculptGeometry(boxMesh());
    const received = structuredClone(prepared, { transfer: sculptGeometryTransferables(prepared) });
    expect(prepared.positions.byteLength).toBe(0);
    const normals = vi.spyOn(THREE.BufferGeometry.prototype, "computeVertexNormals");
    const bounds = vi.spyOn(THREE.BufferGeometry.prototype, "computeBoundingBox");
    const sphere = vi.spyOn(THREE.BufferGeometry.prototype, "computeBoundingSphere");
    const { geometry, edges } = restoreSculptGeometry(received);
    expect(geometry.getAttribute("position").array).toBe(received.positions);
    expect(geometry.getAttribute("normal").array).toBe(received.normals);
    expect(geometry.index?.array).toBe(received.bvh.index);
    expect(normals).not.toHaveBeenCalled();
    expect(bounds).not.toHaveBeenCalled();
    expect(sphere).not.toHaveBeenCalled();
    expect([...edges.keys()]).toEqual([60, 14]);
    expect(edges.get(60)?.getAttribute("position").array).toBe(received.edges[0].positions);
  });

  it("preserves surface coordinates and provides a working picking tree", () => {
    const { geometry } = restoreSculptGeometry(prepareSculptGeometry(boxMesh()));
    expect(geometry.boundingBox?.min.toArray()).toEqual([-1, 0, -1]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([1, 2, 1]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.raycast = acceleratedRaycast;
    const ray = new THREE.Raycaster(new THREE.Vector3(0.25, 5, 0.25), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    expect(hit.point.toArray()).toEqual([0.25, 2, 0.25]);
    expect(hit.face?.normal.toArray()).toEqual([0, 1, 0]);
  });

  it("preserves supplied smooth normals", () => {
    const mesh = boxMesh();
    const normals = mesh.positions.map((_, index) => index % 3 === 1 ? 1 : 0);
    const result = prepareSculptGeometry({ ...mesh, normals });
    expect(Array.from(result.normals)).toEqual(normals);
  });

  it("frees superseded GPU buffers only after the last user releases them", () => {
    const { geometry } = restoreSculptGeometry(prepareSculptGeometry(boxMesh()));
    const disposed = vi.fn();
    geometry.addEventListener("dispose", disposed);
    retainSculptGeometry(geometry);
    retainSculptGeometry(geometry);
    releaseSculptGeometry(geometry);
    expect(disposed).not.toHaveBeenCalled();
    releaseSculptGeometry(geometry);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(geometry.boundsTree).toBeDefined();
    retainSculptGeometry(geometry);
    releaseSculptGeometry(geometry);
    expect(disposed).toHaveBeenCalledTimes(2);
  });
});
