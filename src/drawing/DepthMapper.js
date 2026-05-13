// DepthMapper — turn MediaPipe normalized landmarks (x,y in [0,1], z relative)
// into Three.js world coordinates. Z is the weakest signal MediaPipe gives us,
// so we expose zGain + zOffset and clamp to a usable window in front of camera.
//
// Strategy:
//   - x,y -> ray through the perspective camera at a chosen depth
//   - chosen depth = clamp(zGain * landmark.z + zOffset, NEAR, FAR)
//   - returns a THREE.Vector3 in world space
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';

const _tmpNDC = new THREE.Vector3();

export function worldFromLandmark(lm, camera) {
  // NDC: MediaPipe gives (0,0)=top-left. Flip Y. Mirror X when selfie mirror is on.
  let nx = lm.x * 2 - 1;
  const ny = -(lm.y * 2 - 1);
  if (AppState.mirror) nx = -nx;

  // depth target in world z (negative = into screen)
  const z = THREE.MathUtils.clamp(
    CONFIG.Z_GAIN * (lm.z || 0) + CONFIG.Z_OFFSET,
    CONFIG.Z_FAR_CLAMP,
    CONFIG.Z_NEAR_CLAMP,
  );

  // unproject an NDC point at z=0 to get a ray, then walk along the ray until
  // its world-space z hits our target depth. For a standard perspective cam
  // at origin looking -z, this is equivalent to scaling NDC-x,y by the plane
  // size at that depth.
  const vFov = (camera.fov * Math.PI) / 180;
  const planeH = 2 * Math.tan(vFov / 2) * Math.abs(z);
  const planeW = planeH * camera.aspect;
  const x = nx * 0.5 * planeW;
  const y = ny * 0.5 * planeH;

  return new THREE.Vector3(x, y, z);
}

// Same but reuses a provided Vector3 to avoid per-frame allocs during drawing.
export function worldFromLandmarkInto(out, lm, camera) {
  let nx = lm.x * 2 - 1;
  const ny = -(lm.y * 2 - 1);
  if (AppState.mirror) nx = -nx;
  const z = THREE.MathUtils.clamp(
    CONFIG.Z_GAIN * (lm.z || 0) + CONFIG.Z_OFFSET,
    CONFIG.Z_FAR_CLAMP,
    CONFIG.Z_NEAR_CLAMP,
  );
  const vFov = (camera.fov * Math.PI) / 180;
  const planeH = 2 * Math.tan(vFov / 2) * Math.abs(z);
  const planeW = planeH * camera.aspect;
  out.set(nx * 0.5 * planeW, ny * 0.5 * planeH, z);
  return out;
}
