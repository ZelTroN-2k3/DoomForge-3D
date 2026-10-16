import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { navigateTouchCamera } from "@/lib/touchCamera";
import type { TouchNavigation } from "@/lib/touchGestures";

const gesture = (patch: Partial<TouchNavigation> = {}): TouchNavigation => ({ kind: "pan-zoom", dx: 0, dy: 0, scale: 1, center: { x: 200, y: 200 }, ...patch });
function perspective() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe("touch camera navigation", () => {
  it("pinches perspective distance without moving the target", () => {
    const camera = perspective();
    const target = new THREE.Vector3();
    navigateTouchCamera(camera, target, gesture({ scale: 2 }), 600);
    expect(camera.position.distanceTo(target)).toBeCloseTo(50);
    expect(target.toArray()).toEqual([0, 0, 0]);
    navigateTouchCamera(camera, target, gesture({ scale: 1000 }), 600);
    expect(camera.position.distanceTo(target)).toBeCloseTo(18);
  });

  it("pinches orthographic zoom without changing viewing distance", () => {
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 6000);
    camera.position.set(0, 0, 100);
    const target = new THREE.Vector3();
    navigateTouchCamera(camera, target, gesture({ scale: 2 }), 600);
    expect(camera.zoom).toBe(2);
    expect(camera.position.z).toBe(100);
    navigateTouchCamera(camera, target, gesture({ scale: 1000 }), 600);
    expect(camera.zoom).toBe(100);
  });

  it("pans camera and target together in screen coordinates", () => {
    const camera = perspective();
    const target = new THREE.Vector3();
    navigateTouchCamera(camera, target, gesture({ dx: 30, dy: 20 }), 600);
    expect(target.x).toBeLessThan(0);
    expect(target.y).toBeGreaterThan(0);
    expect(camera.position.clone().sub(target).toArray()).toEqual([0, 0, 100]);
  });

  it("orbits around the existing target at a fixed distance and remains finite at poles", () => {
    const camera = perspective();
    const target = new THREE.Vector3();
    navigateTouchCamera(camera, target, gesture({ kind: "orbit", dx: 150 }), 600);
    expect(camera.position.x).toBeCloseTo(-100);
    expect(camera.position.length()).toBeCloseTo(100);
    navigateTouchCamera(camera, target, gesture({ kind: "orbit", dy: 100000 }), 600);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.position.distanceTo(target)).toBeCloseTo(100);
  });
});
