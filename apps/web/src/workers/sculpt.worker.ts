import { sculptMeshAtPoint, type SculptBrushSettings, type SculptPoint } from "@/lib/sculptBrush";
import type { WorkplaneShape } from "@/types/sketchforge";
import { prepareSculptGeometry, sculptGeometryTransferables, type SculptGeometryBuffers } from "@/lib/sculptGeometry";

export type SculptRequest = {
  // Initialize once per stroke; later dabs reuse the worker's current mesh.
  shape?: Pick<WorkplaneShape, "x" | "z" | "elevation"> & {
    importedMesh: Omit<NonNullable<WorkplaneShape["importedMesh"]>, "positions" | "normals">;
    positions: Float64Array;
  };
  point: SculptPoint;
  settings: SculptBrushSettings;
};
export type SculptResponse = {
  patch: Omit<Partial<WorkplaneShape>, "importedMesh">;
  mesh: Omit<NonNullable<WorkplaneShape["importedMesh"]>, "positions" | "normals">;
  positions: Float64Array;
  normals?: Float64Array;
  geometry: SculptGeometryBuffers;
} | { patch: null } | { error: string };

let currentShape: Pick<WorkplaneShape, "x" | "z" | "elevation" | "importedMesh"> | undefined;

self.onmessage = (event: MessageEvent<SculptRequest>) => {
  try {
    const { shape, point, settings } = event.data;
    if (shape) {
      currentShape = {
        x: shape.x, z: shape.z, elevation: shape.elevation,
        importedMesh: { ...shape.importedMesh, positions: Array.from(shape.positions) },
      };
    }
    if (!currentShape) throw new Error("Sculpt stroke has no mesh");
    const result = sculptMeshAtPoint(currentShape, point, settings);
    if (!result?.importedMesh) {
      self.postMessage({ patch: null } satisfies SculptResponse);
      return;
    }
    currentShape = { ...currentShape, ...result };
    const { importedMesh, ...patch } = result;
    const { positions: sourcePositions, normals: sourceNormals, ...mesh } = importedMesh;
    const positions = new Float64Array(sourcePositions);
    const normals = sourceNormals ? new Float64Array(sourceNormals) : undefined;
    const geometry = prepareSculptGeometry(importedMesh);
    const response: SculptResponse = { patch, mesh, positions, normals, geometry };
    self.postMessage(response, { transfer: [positions.buffer, ...(normals ? [normals.buffer] : []), ...sculptGeometryTransferables(geometry)] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Sculpt brush failed" } satisfies SculptResponse);
  }
};
