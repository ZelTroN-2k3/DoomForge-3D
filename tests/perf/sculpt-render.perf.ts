import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { prepareSculptGeometry, restoreSculptGeometry, sculptGeometryTransferables } from "@/lib/sculptGeometry";
import { copySculptNumbers } from "@/lib/sculptTransfer";

describe("dense sculpt result rendering", () => {
  it.each([140, 316])("prepares a %i-square grid outside the UI handoff", async (size) => {
    const positions: number[] = [];
    for (let x = 0; x < size; x += 1) {
      for (let z = 0; z < size; z += 1) {
        positions.push(x, 0, z, x + 1, 0, z, x, 0, z + 1, x + 1, 0, z, x + 1, 0, z + 1, x, 0, z + 1);
      }
    }
    const mesh = { positions, baseWidth: size, baseHeight: 0.001, baseDepth: size, triangleCount: positions.length / 9, sourceFormat: "json" as const };
    const baselineStart = performance.now();
    const oldGeometry = new THREE.BufferGeometry();
    oldGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    oldGeometry.computeVertexNormals();
    oldGeometry.computeBoundingBox();
    oldGeometry.translate(0, 0, 0);
    new MeshBVH(oldGeometry, { targetLeafSize: 12 });
    if (mesh.triangleCount <= 40_000) new THREE.EdgesGeometry(oldGeometry, 60);
    const baselineMs = performance.now() - baselineStart;
    const prepared = prepareSculptGeometry(mesh);
    const transferred = structuredClone(prepared, { transfer: sculptGeometryTransferables(prepared) });
    const hydrateStart = performance.now();
    const { geometry } = restoreSculptGeometry(transferred);
    const hydrateMs = performance.now() - hydrateStart;
    const copyStart = performance.now();
    const restoredPositions = await copySculptNumbers(new Float64Array(positions), new Array<number>(positions.length));
    const copyWallMs = performance.now() - copyStart;
    expect(geometry.getAttribute("position").array).toBe(transferred.positions);
    expect(restoredPositions?.length).toBe(positions.length);
    expect(geometry.boundsTree).toBeDefined();
    console.log(JSON.stringify({ triangles: mesh.triangleCount, previousBlockingRenderMs: baselineMs, transferredGeometryHandoffMs: hydrateMs, yieldingProjectCopyWallMs: copyWallMs }));
  });
});
