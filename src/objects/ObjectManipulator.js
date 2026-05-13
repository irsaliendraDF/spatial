// ObjectManipulator — two-hand pinch-grab for translate/rotate/scale.
//
// On TWO_HAND_PINCH_GRAB (starting = true): find closest object to pinch
// midpoint within GRAB_RADIUS_M; remember its start transform + the start
// pinch state (midpoint, inter-hand vector, distance). On subsequent frames,
// derive deltas:
//   translate: newMid - startMid   (with 2cm deadzone)
//   rotate:    quaternion rotating startVec -> newVec   (3° deadzone)
//   scale:     newInterDist / startInterDist, applied multiplicatively to start scale
//
// On TWO_HAND_PINCH_RELEASE, release. Snapping applied at release if enabled.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { snapPosition, snapRotation } from './Snapping.js';

function closestObject(objects, point, radius) {
  let best = null, bestD = radius;
  for (const o of objects) {
    const d = o.position.distanceTo(point);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

export class ObjectManipulator {
  constructor({ spawner, physics, bus }) {
    this.spawner = spawner;
    this.physics = physics;
    this.bus = bus;
    this.grab = null;      // { mesh, startPos, startQuat, startScale, startMid, startVec, startDist }

    bus.on('TWO_HAND_PINCH_GRAB', (e) => this._onGrab(e));
    bus.on('TWO_HAND_PINCH_RELEASE', () => this._release());
  }

  _onGrab(evt) {
    const mid = evt.anchor;
    const vec = evt.extra.rightPinch.clone().sub(evt.extra.leftPinch);
    const dist = vec.length();

    if (!this.grab) {
      const mesh = closestObject(this.spawner.getObjects(), mid, CONFIG.GRAB_RADIUS_M);
      if (!mesh) return;
      this.grab = {
        mesh,
        startPos: mesh.position.clone(),
        startQuat: mesh.quaternion.clone(),
        startScale: mesh.scale.clone(),
        startMid: mid.clone(),
        startVec: vec.clone().normalize(),
        startDist: dist,
      };
      this.physics?.setGrabbed(mesh, true);
      return;
    }

    // continuous update
    const g = this.grab;
    const mesh = g.mesh;

    // --- translate with deadzone ---
    const delta = mid.clone().sub(g.startMid);
    if (delta.length() > CONFIG.GRAB_DEADZONE_M) {
      const shrunk = delta.clone().normalize().multiplyScalar(delta.length() - CONFIG.GRAB_DEADZONE_M);
      mesh.position.copy(g.startPos.clone().add(shrunk));
    }

    // --- rotate (align startVec -> currentVec) ---
    const curVec = vec.clone().normalize();
    const angleRad = Math.acos(THREE.MathUtils.clamp(g.startVec.dot(curVec), -1, 1));
    if (angleRad > THREE.MathUtils.degToRad(CONFIG.GRAB_ROT_DEADZONE_DEG)) {
      const axis = g.startVec.clone().cross(curVec).normalize();
      if (axis.lengthSq() > 0.001) {
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(axis, angleRad);
        mesh.quaternion.copy(deltaQ.clone().multiply(g.startQuat));
      }
    }

    // --- scale multiplicatively ---
    const s = dist / Math.max(0.001, g.startDist);
    const clamped = THREE.MathUtils.clamp(s, 0.2, 5.0);
    mesh.scale.copy(g.startScale.clone().multiplyScalar(clamped));

    // keep physics body aligned while grabbed
    if (CONFIG.PHYSICS_ENABLED) this.physics.syncFromMesh(mesh);
  }

  _release() {
    if (!this.grab) return;
    const mesh = this.grab.mesh;

    // Snap at release (not during — less jittery)
    snapPosition(mesh.position);
    snapRotation(mesh.quaternion);
    this.physics?.setGrabbed(mesh, false);
    if (CONFIG.PHYSICS_ENABLED) this.physics.syncFromMesh(mesh);

    this.grab = null;
  }
}
