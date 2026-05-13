// Snapping — pure functions applied to an in-progress transform.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function snapPosition(pos) {
  if (!CONFIG.OBJECT_SNAP) return pos;
  const g = CONFIG.OBJECT_SNAP_GRID;
  pos.x = Math.round(pos.x / g) * g;
  pos.z = Math.round(pos.z / g) * g;
  // Floor snap: if < 5cm above 0, clamp to 0.
  if (CONFIG.OBJECT_FLOOR_SNAP && pos.y < 0.05 && pos.y > -0.2) pos.y = 0;
  return pos;
}

export function snapRotation(quat) {
  if (!CONFIG.OBJECT_SNAP) return quat;
  const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
  const step = THREE.MathUtils.degToRad(CONFIG.OBJECT_ROT_SNAP_DEG);
  euler.x = Math.round(euler.x / step) * step;
  euler.y = Math.round(euler.y / step) * step;
  euler.z = Math.round(euler.z / step) * step;
  quat.setFromEuler(euler);
  return quat;
}
