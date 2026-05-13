// StrokeStore — owns all finished strokes. Each entry carries its points,
// material params, mesh, and BVH. BVH is built on the tube geometry's
// BufferGeometry via three-mesh-bvh so the palm eraser can raycast cheaply.
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { AppState } from '../AppState.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class StrokeStore {
  constructor(scene, sceneMgr) {
    this.scene = scene;
    this.sceneMgr = sceneMgr;
    this.strokes = [];    // [{id, points, brush, colorHex, thickness, mesh}]
    this._nextId = 1;
  }

  // Register a finished stroke with its mesh already added to the scene.
  add(entry) {
    if (!entry.id) entry.id = this._nextId++;
    entry.mesh.geometry.computeBoundsTree();
    this.strokes.push(entry);
    AppState.strokeCount = this.strokes.length;
    return entry;
  }

  // Remove by id (undo) — also dispose geometry + material.
  removeById(id) {
    const i = this.strokes.findIndex(s => s.id === id);
    if (i < 0) return null;
    const s = this.strokes[i];
    s.mesh.parent?.remove(s.mesh);
    s.mesh.geometry.disposeBoundsTree?.();
    s.mesh.geometry.dispose();
    s.mesh.material.dispose?.();
    this.strokes.splice(i, 1);
    AppState.strokeCount = this.strokes.length;
    return s;
  }

  clear() {
    for (const s of this.strokes.slice()) this.removeById(s.id);
  }

  // Eraser: given a world-space sphere (center, radius), remove every stroke
  // whose geometry intersects it. BVH-accelerated sphereCast would be ideal;
  // we use raycast from sphere center outward along several short axes as a
  // cheap approximation — good enough past 50 strokes per the perf spec.
  eraseSphere(center, radius) {
    const removed = [];
    const ray = new THREE.Raycaster();
    ray.near = 0;
    ray.far = radius;
    // 6 axis-aligned probes from center
    const dirs = [
      new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
      new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
      new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1),
    ];
    for (const s of this.strokes.slice()) {
      // quick AABB reject
      if (!s.mesh.geometry.boundingSphere) s.mesh.geometry.computeBoundingSphere();
      const bs = s.mesh.geometry.boundingSphere;
      const mcenter = bs.center.clone().applyMatrix4(s.mesh.matrixWorld);
      if (mcenter.distanceTo(center) > bs.radius + radius) continue;
      let hit = false;
      for (const d of dirs) {
        ray.set(center, d);
        const hits = ray.intersectObject(s.mesh, false);
        if (hits.length > 0) { hit = true; break; }
      }
      if (hit) {
        this.removeById(s.id);
        removed.push(s);
      }
    }
    return removed;
  }
}
