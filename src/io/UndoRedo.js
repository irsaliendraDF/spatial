// UndoRedo — command stack. Commands describe an *add* action; undo deletes
// the created entity and stores a serialized form in the redo stack; redo
// rehydrates that serialized form back into the scene.
//
// We use serialized forms (plain data) rather than keeping disposed meshes
// around, so redo survives across non-trivial operations.
import * as THREE from 'three';
import { AppState } from '../AppState.js';
import { buildBrushMaterial } from '../drawing/BrushPresets.js';
import { templateById } from '../objects/ObjectLibrary.js';

export class UndoStack {
  constructor({ strokeStore, spawner, sceneMgr }) {
    this.strokeStore = strokeStore;
    this.spawner = spawner;
    this.sceneMgr = sceneMgr;
    this.undo = [];     // [{type:'addStroke', id} | {type:'addObject', id}]
    this.redo = [];     // [{type:'strokeData', entry} | {type:'objectData', data}]
    this._syncHud();
  }

  push(cmd) {
    this.undo.push(cmd);
    this.redo.length = 0;
    this._syncHud();
  }

  do() {
    const cmd = this.undo.pop();
    if (!cmd) return;
    if (cmd.type === 'addStroke') {
      const entry = this.strokeStore.strokes.find(s => s.id === cmd.id);
      if (entry) {
        const serialized = {
          points: entry.points,
          thicknesses: entry.thicknesses,
          brush: entry.brush,
          colorHex: entry.colorHex,
          radius: entry.radius,
        };
        this.strokeStore.removeById(entry.id);
        this.redo.push({ type: 'strokeData', data: serialized });
      }
    } else if (cmd.type === 'addObject') {
      const obj = this.spawner.getObjects().find(o => o.uuid === cmd.id);
      if (obj) {
        const data = {
          templateId: obj.userData.templateId,
          pos: obj.position.toArray(),
          quat: obj.quaternion.toArray(),
          scale: obj.scale.toArray(),
        };
        this.spawner.removeByUuid(obj.uuid);
        this.redo.push({ type: 'objectData', data });
      }
    }
    this._syncHud();
  }

  redoCmd() {
    const cmd = this.redo.pop();
    if (!cmd) return;
    if (cmd.type === 'strokeData') {
      const d = cmd.data;
      const pts3 = d.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      if (pts3.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
        const geo = new THREE.TubeGeometry(curve, Math.max(8, pts3.length), d.radius, 6, false);
        const { material, bloom, decorate } = buildBrushMaterial(d.brush, d.colorHex);
        const mesh = new THREE.Mesh(geo, material);
        if (bloom) this.sceneMgr.markBloom(mesh);
        AppState.stageGroup.add(mesh);
        if (decorate) decorate(mesh, { points: pts3, radius: d.radius }, this.sceneMgr);
        const entry = this.strokeStore.add({
          id: null,
          points: d.points,
          thicknesses: d.thicknesses,
          brush: d.brush,
          colorHex: d.colorHex,
          radius: d.radius,
          mesh,
        });
        this.undo.push({ type: 'addStroke', id: entry.id });
      }
    } else if (cmd.type === 'objectData') {
      const d = cmd.data;
      const tmpl = templateById(d.templateId);
      const m = tmpl.build();
      m.position.fromArray(d.pos);
      m.quaternion.fromArray(d.quat);
      m.scale.fromArray(d.scale);
      m.userData.templateId = tmpl.id;
      m.userData.isSpatialObject = true;
      m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      AppState.stageGroup.add(m);
      this.spawner.objects.push(m);
      AppState.objectCount = this.spawner.objects.length;
      this.undo.push({ type: 'addObject', id: m.uuid });
    }
    this._syncHud();
  }

  _syncHud() {
    AppState.undoDepth = this.undo.length;
    AppState.redoDepth = this.redo.length;
  }
}
