// ObjectSpawner — handles GUN_SHAPE aiming, ghost preview, and commit via THUMBS_UP.
//
// Ray priority: spawn plane (invisible 4x4m plane at y=0) → floor (same) → scene props.
// THUMBS_UP while a ghost is live commits the spawn. PEACE cycles library forward,
// PEACE_BOTH cycles backward. Number keys 1..8 set directly.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import { templateByIndex, LIBRARY } from './ObjectLibrary.js';

export class ObjectSpawner {
  constructor({ sceneMgr, bus, physics, undoStack, onSpawned }) {
    this.sceneMgr = sceneMgr;
    this.bus = bus;
    this.physics = physics;
    this.undoStack = undoStack;
    this.onSpawned = onSpawned;
    this.objects = [];      // spawned meshes/groups (user content)
    this.ghost = null;      // translucent preview mesh

    // Invisible spawn plane at y=0 for raycasting
    this.spawnPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    bus.on('GUN_SHAPE', (e) => this._onAim(e));
    bus.on('THUMBS_UP', (e) => this._onCommit(e));
    bus.on('PEACE', () => this._cycleLibrary(+1));
    bus.on('PEACE_BOTH', () => this._cycleLibrary(-1));
  }

  getObjects() { return this.objects; }

  _cycleLibrary(dir) {
    CONFIG.OBJECT_LIBRARY_INDEX = (CONFIG.OBJECT_LIBRARY_INDEX + dir + LIBRARY.length) % LIBRARY.length;
    // if ghost is up, refresh it
    if (this.ghost) {
      const pos = this.ghost.position.clone();
      this._clearGhost();
      this._makeGhost(pos);
    }
  }

  setLibraryIndex(i) {
    CONFIG.OBJECT_LIBRARY_INDEX = ((i % LIBRARY.length) + LIBRARY.length) % LIBRARY.length;
    if (this.ghost) {
      const pos = this.ghost.position.clone();
      this._clearGhost();
      this._makeGhost(pos);
    }
  }

  _onAim(evt) {
    if (evt.confidence < 0.6) return;
    // project ray from index tip along its direction to y=0 plane
    const origin = evt.anchor;
    const dir = evt.direction.clone().normalize();
    const hit = new THREE.Vector3();
    const ray = new THREE.Ray(origin, dir);
    if (!ray.intersectPlane(this.spawnPlane, hit)) {
      // ray parallel to floor — drop ghost 1m ahead along the ray
      hit.copy(origin).add(dir.multiplyScalar(1));
    }
    // clamp to a reasonable range
    if (hit.length() > 10) hit.setLength(8);

    if (!this.ghost) this._makeGhost(hit);
    else this.ghost.position.copy(hit);
  }

  _makeGhost(pos) {
    const tmpl = templateByIndex(CONFIG.OBJECT_LIBRARY_INDEX);
    const g = tmpl.build();
    g.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.45;
        o.material.depthWrite = false;
      }
    });
    g.position.copy(pos);
    g.userData.isGhost = true;
    AppState.stageGroup.add(g);
    this.ghost = g;
  }

  _clearGhost() {
    if (!this.ghost) return;
    AppState.stageGroup.remove(this.ghost);
    this.ghost.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); }
    });
    this.ghost = null;
  }

  _onCommit() {
    if (!this.ghost) return;
    // Clone the template fresh (not the ghost — that one has ghost materials).
    const tmpl = templateByIndex(CONFIG.OBJECT_LIBRARY_INDEX);
    const obj = tmpl.build();
    obj.position.copy(this.ghost.position);
    obj.userData.templateId = tmpl.id;
    obj.userData.isSpatialObject = true;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    AppState.stageGroup.add(obj);
    this.objects.push(obj);
    AppState.objectCount = this.objects.length;

    if (CONFIG.PHYSICS_ENABLED) this.physics.attach(obj);

    this.undoStack?.push({ type: 'addObject', id: obj.uuid });
    this.onSpawned?.(obj);

    this._clearGhost();
  }

  removeByUuid(uuid) {
    const i = this.objects.findIndex(o => o.uuid === uuid);
    if (i < 0) return null;
    const o = this.objects[i];
    AppState.stageGroup.remove(o);
    this.physics?.detach(o);
    o.traverse(n => {
      if (n.isMesh) { n.geometry.dispose(); n.material.dispose?.(); }
    });
    this.objects.splice(i, 1);
    AppState.objectCount = this.objects.length;
    return o;
  }

  clearAll() {
    for (const o of this.objects.slice()) this.removeByUuid(o.uuid);
  }

  clearGhost() { this._clearGhost(); }
}
