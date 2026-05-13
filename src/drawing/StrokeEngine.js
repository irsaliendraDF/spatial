// StrokeEngine — streams points onto the active stroke once per animation frame
// by reading the tracked hand's landmarks directly. The gesture bus is used
// only to START a stroke (first POINT_DRAW or PINCH_DRAW event) and to STOP it
// (FIST dead-man). While active, we do NOT depend on the gesture continuing
// to fire — which was the cause of "stroke doesn't follow my finger": the
// classifier drops out on finger tremor, and the event stream went silent even
// though the hand was clearly still there.
//
// Stroke finalization happens only when:
//   - the hand disappears for >400ms, or
//   - FIST fires (dead-man pause).
//
// This architecture also reduces perceived lag: no gesture hysteresis stands
// between hand motion and stroke output once drawing has started.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import { buildBrushMaterial } from './BrushPresets.js';
import { worldFromLandmark } from './DepthMapper.js';
import { L } from '../gestures/gestureDefs.js';

const PREVIEW_WINDOW = 60;     // points re-tubed each frame for the live preview
const TUBE_SEGMENTS_PER_POINT = 1;
const HAND_LOST_GRACE_MS = 400;

export class StrokeEngine {
  constructor({ sceneMgr, strokeStore, undoStack, bus }) {
    this.sceneMgr = sceneMgr;
    this.strokeStore = strokeStore;
    this.undoStack = undoStack;
    this.bus = bus;
    this.active = null;
    this._paused = false;
    this._activeHand = null;
    this._mode = null;           // 'POINT' | 'PINCH' while active
    this._lastHandSeenMs = 0;

    // Gesture events only START the stroke; FIST ends it.
    bus.on('POINT_DRAW', (e) => this._onStartDraw(e, 'POINT'));
    bus.on('PINCH_DRAW', (e) => this._onStartDraw(e, 'PINCH'));
    // FIST finalizes (keeps + decorates) the stroke instead of canceling.
    // Previously a closed fist discarded mid-stroke work, which made the
    // sparkle effect feel random when users naturally close their fingers.
    bus.on('FIST', () => {
      this._paused = true;
      this._endStroke(false);         // false = keep the stroke, add sparkle
    });
    // Release the dead-man on any non-FIST event
    bus.on('*', (e) => { if (e.name !== 'FIST') this._paused = false; });

    // Consecutive rejected-jump counter. If MediaPipe teleports the hand
    // (common when fingers close quickly — the model re-classifies pose and
    // snaps landmarks), we skip those frames. After too many in a row we
    // assume the new position is real and resync.
    this._jumpRejections = 0;
  }

  // Called every animation frame. If a stroke is active, reads the current
  // landmarks directly and streams points.
  tick() {
    if (!this.active || this._paused) return;
    const now = performance.now();

    const hand = AppState.handsDetected.find(h => h.hand === this._activeHand);
    if (!hand) {
      if (now - this._lastHandSeenMs > HAND_LOST_GRACE_MS) {
        this._endStroke(false);
      }
      return;
    }
    this._lastHandSeenMs = now;

    // derive current anchor + thickness from the mode's landmarks
    let anchor, thickness;
    const cam = AppState.camera;
    if (this._mode === 'PINCH') {
      const tip = worldFromLandmark(hand.landmarks[L.INDEX_TIP], cam);
      const thu = worldFromLandmark(hand.landmarks[L.THUMB_TIP], cam);
      anchor = tip.add(thu).multiplyScalar(0.5);
      const dx = hand.landmarks[L.THUMB_TIP].x - hand.landmarks[L.INDEX_TIP].x;
      const dy = hand.landmarks[L.THUMB_TIP].y - hand.landmarks[L.INDEX_TIP].y;
      const pinch = Math.hypot(dx, dy);
      const pressure = 1 - THREE.MathUtils.clamp(pinch / CONFIG.PINCH_MAX_DIST, 0, 1);
      thickness = THREE.MathUtils.lerp(CONFIG.BRUSH_MIN_THICK, CONFIG.BRUSH_MAX_THICK, pressure);
    } else {
      anchor = worldFromLandmark(hand.landmarks[L.INDEX_TIP], cam);
      thickness = (CONFIG.BRUSH_MIN_THICK + CONFIG.BRUSH_MAX_THICK) * 0.5;
    }

    this._appendPoint(anchor, thickness);
  }

  // Called by gesture bus when POINT_DRAW / PINCH_DRAW fires. If we're already
  // drawing with the same hand, no-op; otherwise start a new stroke.
  _onStartDraw(evt, mode) {
    if (this._paused) return;
    if (evt.confidence < 0.5) return;
    this._lastHandSeenMs = performance.now();
    if (this.active) return;   // already drawing — ignore
    this._activeHand = evt.hand;
    this._mode = mode;
    const anchor = evt.anchor.clone();
    const thickness = mode === 'PINCH'
      ? THREE.MathUtils.lerp(
          CONFIG.BRUSH_MIN_THICK, CONFIG.BRUSH_MAX_THICK,
          1 - THREE.MathUtils.clamp((evt.extra?.pinchDist ?? 0) / CONFIG.PINCH_MAX_DIST, 0, 1))
      : (CONFIG.BRUSH_MIN_THICK + CONFIG.BRUSH_MAX_THICK) * 0.5;
    this._beginStroke(anchor, thickness);
  }

  _appendPoint(anchor, thickness) {
    const pts = this.active.points;
    const last = pts[pts.length - 1];

    // Jump rejection — MediaPipe occasionally teleports landmarks 20-40 cm
    // in a single frame when it re-classifies hand pose (fingers curling is
    // the classic trigger). A real hand can't move that fast.
    if (last) {
      const d = last.distanceTo(anchor);
      if (d > 0.22) {
        this._jumpRejections++;
        if (this._jumpRejections < 10) return;   // skip this frame
        // 10 consecutive jump-sized deltas means the hand really has moved —
        // snap to the new position and resume.
        this._jumpRejections = 0;
      } else {
        this._jumpRejections = 0;
      }
    }

    // decimate: skip if too close to last point
    if (last && last.distanceTo(anchor) < CONFIG.STROKE_DECIMATION) {
      this.active.thicknesses[pts.length - 1] = thickness;
      return;
    }

    // optional EMA smoothing on top of One-Euro (default is 0 now)
    if (last && CONFIG.STROKE_SMOOTHING > 0) {
      anchor.lerp(last, CONFIG.STROKE_SMOOTHING * 0.5);
    }
    pts.push(anchor);
    this.active.thicknesses.push(thickness);

    this._regenPreview();
  }

  _beginStroke(firstPoint, thickness) {
    const presetName = CONFIG.BRUSH_PRESET;
    const colorHex = CONFIG.BRUSH_COLOR;
    const { material, bloom, decorate } = buildBrushMaterial(presetName, colorHex);

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (bloom && this.sceneMgr) this.sceneMgr.markBloom(mesh);
    AppState.stageGroup.add(mesh);

    this.active = {
      points: [firstPoint.clone()],
      thicknesses: [thickness],
      mesh,
      brush: presetName,
      colorHex,
      decorate,
    };
  }

  _regenPreview() {
    const stroke = this.active;
    if (!stroke || stroke.points.length < 2) return;
    const n = stroke.points.length;
    const start = Math.max(0, n - PREVIEW_WINDOW);
    const pts = stroke.points.slice(start);
    const avgThick = stroke.thicknesses[n - 1];
    const geo = this._makeTubeGeo(pts, avgThick);
    stroke.mesh.geometry.dispose();
    stroke.mesh.geometry = geo;
  }

  _makeTubeGeo(points, radius) {
    if (points.length < 2) return new THREE.BufferGeometry();
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    const tubular = Math.max(8, Math.floor(points.length * TUBE_SEGMENTS_PER_POINT));
    const radial = 6;
    return new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  }

  _endStroke(canceled = false) {
    const stroke = this.active;
    this.active = null;
    this._activeHand = null;
    this._mode = null;
    if (!stroke) return;

    if (stroke.points.length < 2 || canceled) {
      stroke.mesh.parent?.remove(stroke.mesh);
      stroke.mesh.geometry.dispose();
      stroke.mesh.material.dispose?.();
      return;
    }

    const avgThick = stroke.thicknesses[stroke.thicknesses.length - 1];
    stroke.mesh.geometry.dispose();
    stroke.mesh.geometry = this._makeTubeGeo(stroke.points, avgThick);

    const entry = {
      id: null,
      points: stroke.points.map(p => p.toArray()),
      thicknesses: stroke.thicknesses.slice(),
      brush: stroke.brush,
      colorHex: stroke.colorHex,
      radius: avgThick,
      mesh: stroke.mesh,
    };
    if (stroke.decorate) {
      stroke.decorate(
        stroke.mesh,
        { points: stroke.points, radius: avgThick },
        this.sceneMgr,
      );
    }
    this.strokeStore.add(entry);
    this.undoStack?.push({ type: 'addStroke', id: entry.id });
  }
}
