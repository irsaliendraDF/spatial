// GestureDetector — per-frame classifier for the Spatial gesture set.
//
// Ported from cinematic-gesture-fx: same hysteresis + miss-grace model, same
// confidence-threshold pattern, same two-hand stability gating. The predicate
// list is different (drawing/spawning instead of FX), lives in gestureDefs.js.
//
// Per frame we:
//   1) extract features from each hand's landmarks (fingers, pinch, palm, world positions)
//   2) evaluate all single-hand predicates; fire the highest-priority one
//   3) compute transient events (FIST dead-man, THUMBS_UP confirm are both
//      handled as held gestures; CLAP / SPREAD are transient on the two-hand path)
//   4) evaluate two-hand gestures (pinch grab, frame, clap, spread, double peace)
//
// Held gestures re-emit every frame once stable (so drawing can stream while
// POINT_DRAW holds). Transient events fire once per occurrence with a cooldown.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import {
  L, fingerExtended, thumbExtended, palmNormal, palmFacesCamera,
  pinchDist2D, GESTURES, SINGLE_PRIORITY,
} from './gestureDefs.js';
import { worldFromLandmark } from '../drawing/DepthMapper.js';

function extractFeatures(hand, camera) {
  const lm = hand.landmarks;
  const fingers = {
    thumb: thumbExtended(lm),
    index: fingerExtended(lm, L.INDEX_TIP, L.INDEX_PIP),
    middle: fingerExtended(lm, L.MIDDLE_TIP, L.MIDDLE_PIP),
    ring: fingerExtended(lm, L.RING_TIP, L.RING_PIP),
    pinky: fingerExtended(lm, L.PINKY_TIP, L.PINKY_PIP),
  };
  const pn = palmNormal(lm);
  const pinch = pinchDist2D(lm);

  const palmCenter2D = {
    x: (lm[L.INDEX_MCP].x + lm[L.PINKY_MCP].x + lm[L.WRIST].x) / 3,
    y: (lm[L.INDEX_MCP].y + lm[L.PINKY_MCP].y + lm[L.WRIST].y) / 3,
    z: (lm[L.INDEX_MCP].z + lm[L.PINKY_MCP].z + lm[L.WRIST].z) / 3,
  };

  const indexTipWorld = worldFromLandmark(lm[L.INDEX_TIP], camera);
  const thumbTipWorld = worldFromLandmark(lm[L.THUMB_TIP], camera);
  const palmWorld = worldFromLandmark(palmCenter2D, camera);
  const wristWorld = worldFromLandmark(lm[L.WRIST], camera);
  const indexMcpWorld = worldFromLandmark(lm[L.INDEX_MCP], camera);
  const indexDir = indexTipWorld.clone().sub(indexMcpWorld).normalize();

  const pinchMid = indexTipWorld.clone().add(thumbTipWorld).multiplyScalar(0.5);

  return {
    lm,
    fingers,
    pinchDist: pinch,
    palmNormal: pn,
    palmFacesCamera: palmFacesCamera(lm),
    indexTipWorld, thumbTipWorld, palmWorld, wristWorld, pinchMid, indexDir,
    palm2D: palmCenter2D,
  };
}

function stableFramesFor(name) {
  const o = CONFIG.GESTURE_FRAMES_OVERRIDE?.[name];
  return (typeof o === 'number') ? o : CONFIG.GESTURE_STABLE_FRAMES;
}
function confMinFor(name) {
  const o = CONFIG.GESTURE_CONF_OVERRIDE?.[name];
  return (typeof o === 'number') ? o : CONFIG.GESTURE_CONFIDENCE_MIN;
}
function isEnabled(name) {
  return CONFIG.GESTURE_ENABLED?.[name] !== false;
}

export class GestureDetector {
  constructor(bus) {
    this.bus = bus;
    this.state = {
      Left: this._fresh(),
      Right: this._fresh(),
    };
    this.twoHand = this._freshTwoHand();
  }

  _fresh() {
    return {
      lastFeatures: null,
      stable: {},
      miss: {},
      activeGesture: null,     // the currently-held gesture name
      palm2D: null,
      palm2DTs: 0,
      palmVel: 0,
    };
  }
  _freshTwoHand() {
    return {
      bothStable: 0,
      stable: {},
      miss: {},
      lastClapAt: 0,
      lastSpreadAt: 0,
      lastMidDist: null,
      lastMidDistT: 0,
      grabbing: false,
    };
  }

  // Returns true once stable frames are met, keeps returning true during the
  // miss-grace window if the pose momentarily drops out.
  _hyst(s, name, active) {
    const need = stableFramesFor(name);
    if (active) {
      s.stable[name] = (s.stable[name] || 0) + 1;
      s.miss[name] = 0;
      return s.stable[name] >= need;
    }
    s.miss[name] = (s.miss[name] || 0) + 1;
    if (s.miss[name] >= CONFIG.GESTURE_MISS_GRACE) {
      s.stable[name] = 0;
      return false;
    }
    return (s.stable[name] || 0) >= need;
  }

  detect(camera) {
    const hands = AppState.handsDetected || [];
    const now = performance.now();
    const events = [];

    if (hands.length === 0) {
      this.state.Left = this._fresh();
      this.state.Right = this._fresh();
      return events;
    }

    // --- per-hand features ---
    const byHand = {};
    for (const h of hands) byHand[h.hand] = { h, f: extractFeatures(h, camera) };

    // --- single-hand gesture evaluation ---
    for (const key of Object.keys(byHand)) {
      const { h, f } = byHand[key];
      const s = this.state[key];

      // palm velocity — used for CLAP/SPREAD safety, not drawing
      if (s.palm2D) {
        const dt = Math.max(0.001, (now - s.palm2DTs) / 1000);
        const dx = f.palm2D.x - s.palm2D.x;
        const dy = f.palm2D.y - s.palm2D.y;
        s.palmVel = Math.hypot(dx, dy) / dt;
      }
      s.palm2D = { x: f.palm2D.x, y: f.palm2D.y };
      s.palm2DTs = now;

      // Evaluate all predicates; gather matches, sort by priority, fire top.
      const candidates = [];
      for (const [name, pred] of Object.entries(GESTURES)) {
        if (!isEnabled(name)) continue;
        const r = pred(f);
        if (!r.match) { this._hyst(s, name, false); continue; }
        if (r.confidence < confMinFor(name)) { this._hyst(s, name, false); continue; }
        const passed = this._hyst(s, name, true);
        if (passed) candidates.push({ name, conf: r.confidence, prio: SINGLE_PRIORITY[name] || 0 });
      }

      let activeName = null;
      if (candidates.length) {
        candidates.sort((a, b) => b.prio - a.prio);
        const top = candidates[0];
        activeName = top.name;
        events.push({
          name: top.name,
          hand: key,
          confidence: top.conf,
          anchor: this._anchorFor(top.name, f),
          direction: this._directionFor(top.name, f),
          extra: this._extraFor(top.name, f),
        });
      }
      s.activeGesture = activeName;
      s.lastFeatures = f;
    }

    // --- two-hand gestures ---
    const L_ = byHand.Left, R_ = byHand.Right;
    if (L_ && R_
        && L_.h.score >= CONFIG.TWO_HAND_CONFIDENCE_MIN
        && R_.h.score >= CONFIG.TWO_HAND_CONFIDENCE_MIN) {
      this.twoHand.bothStable++;
    } else {
      // wipe transient state but keep fired-at timestamps for cooldowns
      this.twoHand.bothStable = 0;
      this.twoHand.stable = {};
      this.twoHand.miss = {};
      this.twoHand.grabbing = false;
      this.twoHand.lastMidDist = null;
    }

    const twoReady = L_ && R_ && this.twoHand.bothStable >= CONFIG.TWO_HAND_STABILITY_FRAMES;
    if (twoReady) {
      const fl = L_.f, fr = R_.f;
      const leftPinch = fl.pinchDist < 0.07;
      const rightPinch = fr.pinchDist < 0.07;
      const handDist = fl.palmWorld.distanceTo(fr.palmWorld);
      const midpoint = fl.pinchMid.clone().add(fr.pinchMid).multiplyScalar(0.5);

      // TWO_HAND_PINCH_GRAB — both pinching, within 1m of each other
      const grabActive = leftPinch && rightPinch && handDist < 1.0;
      if (this._hystTwo('TWO_HAND_PINCH_GRAB', grabActive)) {
        events.push({
          name: 'TWO_HAND_PINCH_GRAB',
          hand: 'Both',
          confidence: 0.85,
          anchor: midpoint,
          direction: fr.pinchMid.clone().sub(fl.pinchMid),
          extra: {
            leftPinch: fl.pinchMid.clone(),
            rightPinch: fr.pinchMid.clone(),
            handDist,
            starting: !this.twoHand.grabbing,
          },
        });
        this.twoHand.grabbing = true;
      } else if (this.twoHand.grabbing) {
        // fire a release event so manipulator can let go
        events.push({
          name: 'TWO_HAND_PINCH_RELEASE',
          hand: 'Both', confidence: 0.99,
          anchor: midpoint, direction: new THREE.Vector3(),
          extra: {},
        });
        this.twoHand.grabbing = false;
      }

      // TWO_HAND_FRAME — both L-shapes with thumbs touching
      const lShape = (f) => f.fingers.thumb && f.fingers.index
        && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky;
      const thumbsTouch = fl.thumbTipWorld.distanceTo(fr.thumbTipWorld) < 0.12;
      const framing = lShape(fl) && lShape(fr) && thumbsTouch;
      if (this._hystTwo('TWO_HAND_FRAME', framing)) {
        events.push({
          name: 'TWO_HAND_FRAME',
          hand: 'Both', confidence: 0.82,
          anchor: fl.indexTipWorld.clone().add(fr.indexTipWorld).multiplyScalar(0.5),
          direction: new THREE.Vector3(),
          extra: {},
        });
      }

      // PEACE_BOTH — cycle library backward
      const leftPeace = !fl.fingers.thumb && fl.fingers.index && fl.fingers.middle
        && !fl.fingers.ring && !fl.fingers.pinky;
      const rightPeace = !fr.fingers.thumb && fr.fingers.index && fr.fingers.middle
        && !fr.fingers.ring && !fr.fingers.pinky;
      if (this._hystTwo('PEACE_BOTH', leftPeace && rightPeace)) {
        events.push({
          name: 'PEACE_BOTH', hand: 'Both', confidence: 0.85,
          anchor: fl.palmWorld.clone().add(fr.palmWorld).multiplyScalar(0.5),
          direction: new THREE.Vector3(),
          extra: {},
        });
      }

      // CLAP — hands come together fast (< 0.08m, velocity > 0.5m/s along the closing axis)
      const midDist = handDist;
      if (this.twoHand.lastMidDist != null) {
        const dt = Math.max(0.001, (now - this.twoHand.lastMidDistT) / 1000);
        const closeVel = (this.twoHand.lastMidDist - midDist) / dt;   // +ve = closing
        if (midDist < CONFIG.CLAP_DIST && closeVel > CONFIG.CLAP_VELOCITY
            && now - this.twoHand.lastClapAt > 700) {
          events.push({
            name: 'CLAP', hand: 'Both', confidence: 0.88,
            anchor: fl.palmWorld.clone().add(fr.palmWorld).multiplyScalar(0.5),
            direction: new THREE.Vector3(), extra: { closeVel },
          });
          this.twoHand.lastClapAt = now;
        }
        // SPREAD — hands move apart fast from a close start
        const openVel = -closeVel;                                    // +ve = separating
        if (this.twoHand.lastMidDist < 0.20 && openVel > CONFIG.CLAP_VELOCITY
            && midDist > 0.30
            && now - this.twoHand.lastSpreadAt > 700) {
          events.push({
            name: 'SPREAD', hand: 'Both', confidence: 0.85,
            anchor: fl.palmWorld.clone().add(fr.palmWorld).multiplyScalar(0.5),
            direction: new THREE.Vector3(), extra: { openVel },
          });
          this.twoHand.lastSpreadAt = now;
        }
      }
      this.twoHand.lastMidDist = midDist;
      this.twoHand.lastMidDistT = now;
    }

    // publish for HUD / debug
    AppState.gestureEvents = events.slice();

    // fire through the bus (drawing, spawning, UI all subscribe by name)
    if (this.bus) for (const e of events) this.bus.emit(e);

    return events;
  }

  _hystTwo(name, active) {
    const need = stableFramesFor(name);
    const s = this.twoHand;
    if (active) {
      s.stable[name] = (s.stable[name] || 0) + 1;
      s.miss[name] = 0;
      return s.stable[name] >= need;
    }
    s.miss[name] = (s.miss[name] || 0) + 1;
    if (s.miss[name] >= CONFIG.GESTURE_MISS_GRACE) {
      s.stable[name] = 0;
      return false;
    }
    return (s.stable[name] || 0) >= need;
  }

  _anchorFor(name, f) {
    switch (name) {
      case 'POINT_DRAW':
      case 'GUN_SHAPE':
        return f.indexTipWorld;
      case 'PINCH_DRAW':
        return f.pinchMid;
      case 'L_SHAPE':
        return f.indexTipWorld;
      case 'OPEN_PALM_ERASE':
      case 'FIST':
      case 'THUMBS_UP':
      case 'PEACE':
      default:
        return f.palmWorld;
    }
  }
  _directionFor(name, f) {
    if (name === 'POINT_DRAW' || name === 'GUN_SHAPE') return f.indexDir;
    return new THREE.Vector3(0, 0, -1);
  }
  _extraFor(name, f) {
    if (name === 'PINCH_DRAW') return { pinchDist: f.pinchDist };
    if (name === 'OPEN_PALM_ERASE') return { palmPos: f.palmWorld.clone() };
    return {};
  }
}
