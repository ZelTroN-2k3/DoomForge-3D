import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { sculptMeshAtPoint } from "@/lib/sculptBrush";
import type { SculptRequest, SculptResponse } from "@/workers/sculpt.worker";

afterEach(() => vi.unstubAllGlobals());

describe("persistent sculpt worker", () => {
  it("keeps sequential dabs correct after transferring away render and project buffers", async () => {
    const responses: SculptResponse[] = [];
    const scope = {
      onmessage: (_event: MessageEvent<SculptRequest>) => {},
      postMessage: (value: SculptResponse, options?: StructuredSerializeOptions) => {
        responses.push(structuredClone(value, options));
      },
    };
    vi.stubGlobal("self", scope);
    await import("@/workers/sculpt.worker");
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    geometry.translate(0, 1, 0);
    const mesh = { positions: Array.from(geometry.getAttribute("position").array), baseWidth: 2, baseHeight: 2, baseDepth: 2, triangleCount: 12, sourceFormat: "json" as const };
    let expected = { x: 0, z: 0, elevation: 0, importedMesh: mesh };
    const point = { x: 0, y: 2, z: 0 };
    for (const kind of ["add", "subtract", "smooth"] as const) {
      const settings = { kind, radius: 1, strength: 0.1 };
      const request: SculptRequest = {
        ...(kind === "add" ? { shape: { x: 0, z: 0, elevation: 0, importedMesh: { baseWidth: 2, baseHeight: 2, baseDepth: 2, triangleCount: 12, sourceFormat: "json" }, positions: new Float64Array(mesh.positions) } } : {}),
        point,
        settings,
      };
      scope.onmessage({ data: request } as MessageEvent<SculptRequest>);
      const response = responses.at(-1)!;
      expect("error" in response).toBe(false);
      if ("error" in response || !response.patch) throw new Error("Expected a sculpt result");
      const patch = sculptMeshAtPoint(expected, point, settings)!;
      expect(Array.from(response.positions)).toEqual(patch.importedMesh!.positions);
      expect(response.normals ? Array.from(response.normals) : undefined).toEqual(patch.importedMesh!.normals);
      expect(response.geometry.positions.length).toBe(response.positions.length);
      expected = { ...expected, ...patch, importedMesh: patch.importedMesh! };
    }
  });
});
