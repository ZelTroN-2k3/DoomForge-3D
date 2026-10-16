import * as THREE from "three";
import type { TouchNavigation } from "@/lib/touchGestures";

/** Screen-space touch navigation for both viewport projections. */
export function navigateTouchCamera(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  gesture: TouchNavigation,
  viewportHeight: number,
) {
  const height = Math.max(1, viewportHeight);
  const offset = camera.position.clone().sub(target);
  if (gesture.kind === "orbit") {
    const up = new THREE.Quaternion().setFromUnitVectors(camera.up.clone().normalize(), new THREE.Vector3(0, 1, 0));
    const spherical = new THREE.Spherical().setFromVector3(offset.applyQuaternion(up));
    spherical.theta -= gesture.dx * 2 * Math.PI / height;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - gesture.dy * 2 * Math.PI / height, 0.001, Math.PI - 0.001);
    offset.setFromSpherical(spherical).applyQuaternion(up.invert());
  } else {
    camera.updateMatrixWorld();
    const span = camera instanceof THREE.OrthographicCamera
      ? (camera.top - camera.bottom) / camera.zoom
      : 2 * offset.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, -gesture.dx * span / height).addScaledVector(up, gesture.dy * span / height);
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = THREE.MathUtils.clamp(camera.zoom * gesture.scale, 0.02, 100);
    else offset.setLength(THREE.MathUtils.clamp(offset.length() / gesture.scale, 18, 4200));
  }
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
