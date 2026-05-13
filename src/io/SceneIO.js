// SceneIO — persistence. IndexedDB (idb) for named slots; JSON export = same
// payload serialized; GLB export uses GLTFExporter on stageGroup with stage
// props and webcam excluded.
//
// Round-trip contract (save->reload->load): the snapshot describes strokes by
// their point list + brush + color + radius. On load we rebuild TubeGeometry
// and BVH exactly like a fresh stroke would. Objects load via library templateId.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { openDB } from 'idb';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import { templateById } from '../objects/ObjectLibrary.js';
import { buildBrushMaterial } from '../drawing/BrushPresets.js';

const DB_NAME = 'spatial-scenes';
const STORE = 'slots';
const VERSION = 1;

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) { d.createObjectStore(STORE); },
  });
}

export class SceneIO {
  constructor({ strokeStore, spawner, sceneMgr }) {
    this.strokeStore = strokeStore;
    this.spawner = spawner;
    this.sceneMgr = sceneMgr;
  }

  snapshot() {
    const strokes = this.strokeStore.strokes.map(s => ({
      id: s.id,
      points: s.points,              // already Array[[x,y,z]...]
      thicknesses: s.thicknesses,
      brush: s.brush,
      colorHex: s.colorHex,
      radius: s.radius,
    }));
    const objects = this.spawner.getObjects().map(o => ({
      templateId: o.userData.templateId,
      pos: o.position.toArray(),
      quat: o.quaternion.toArray(),
      scale: o.scale.toArray(),
    }));
    const settings = {};
    for (const k of Object.keys(CONFIG)) {
      if (k.startsWith('_')) continue;
      const v = CONFIG[k];
      if (typeof v === 'function') continue;
      settings[k] = v;
    }
    return {
      strokes, objects, settings,
      meta: { createdAt: Date.now(), version: VERSION },
    };
  }

  async saveSlot(name = 'default') {
    const snap = this.snapshot();
    const d = await db();
    await d.put(STORE, snap, name);
    return snap;
  }

  async listSlots() {
    const d = await db();
    return d.getAllKeys(STORE);
  }

  async loadSlot(name = 'default') {
    const d = await db();
    const snap = await d.get(STORE, name);
    if (!snap) throw new Error(`no slot "${name}"`);
    this._applySnapshot(snap);
    return snap;
  }

  async deleteSlot(name) {
    const d = await db();
    await d.delete(STORE, name);
  }

  _applySnapshot(snap) {
    // wipe current
    this.strokeStore.clear();
    this.spawner.clearAll();

    // settings
    if (snap.settings) {
      for (const [k, v] of Object.entries(snap.settings)) {
        if (k in CONFIG) CONFIG[k] = v;
      }
    }

    // strokes — rebuild tube + BVH
    for (const s of snap.strokes) {
      const pts3 = s.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      if (pts3.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
      const geo = new THREE.TubeGeometry(curve, Math.max(8, pts3.length), s.radius, 6, false);
      const { material, bloom, decorate } = buildBrushMaterial(s.brush, s.colorHex);
      const mesh = new THREE.Mesh(geo, material);
      if (bloom) this.sceneMgr.markBloom(mesh);
      AppState.stageGroup.add(mesh);
      if (decorate) decorate(mesh, { points: pts3, radius: s.radius }, this.sceneMgr);
      this.strokeStore.add({
        id: s.id,
        points: s.points,
        thicknesses: s.thicknesses,
        brush: s.brush,
        colorHex: s.colorHex,
        radius: s.radius,
        mesh,
      });
    }

    // objects
    for (const o of snap.objects) {
      const tmpl = templateById(o.templateId);
      const m = tmpl.build();
      m.position.fromArray(o.pos);
      m.quaternion.fromArray(o.quat);
      m.scale.fromArray(o.scale);
      m.userData.templateId = tmpl.id;
      m.userData.isSpatialObject = true;
      m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      AppState.stageGroup.add(m);
      this.spawner.objects.push(m);
    }
    AppState.objectCount = this.spawner.objects.length;
  }

  // JSON download
  exportJson(filename = 'spatial-scene.json') {
    const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' });
    this._downloadBlob(blob, filename);
  }

  async importJsonFile(file) {
    const text = await file.text();
    const snap = JSON.parse(text);
    this._applySnapshot(snap);
  }

  // GLB export: stageGroup only (no webcam, no stage props)
  async exportGlb(filename = 'spatial-scene.glb') {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        AppState.stageGroup,
        (result) => {
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          this._downloadBlob(blob, filename);
          resolve();
        },
        (err) => reject(err),
        { binary: true, onlyVisible: true },
      );
    });
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
