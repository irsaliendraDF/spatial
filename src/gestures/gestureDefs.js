// gestureDefs — pose-feature helpers and the spatial app's gesture list.
// Helpers (finger extension, pinch distance, palm normal) port the FX app's
// approach; the gesture NAMES and predicates are specific to Spatial.
//
// Predicates consume a Features object extracted by GestureDetector; each
// returns {match, confidence} so the detector can rank candidates and apply
// hysteresis based on the config-driven stable-frame count.

import * as THREE from 'three';

// MediaPipe landmark indices
export const L = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// Extension check: tip farther from wrist than PIP joint.
// Thumb uses distance from palm (middle MCP) instead since it curls sideways.
export function fingerExtended(lm, tip, pip, wrist = L.WRIST) {
  const dx1 = lm[tip].x - lm[wrist].x, dy1 = lm[tip].y - lm[wrist].y;
  const dx2 = lm[pip].x - lm[wrist].x, dy2 = lm[pip].y - lm[wrist].y;
  return Math.hypot(dx1, dy1) > Math.hypot(dx2, dy2) * 1.05;
}
export function thumbExtended(lm) {
  const palm = lm[L.MIDDLE_MCP];
  const dx1 = lm[L.THUMB_TIP].x - palm.x, dy1 = lm[L.THUMB_TIP].y - palm.y;
  const dx2 = lm[L.THUMB_IP].x - palm.x, dy2 = lm[L.THUMB_IP].y - palm.y;
  return Math.hypot(dx1, dy1) > Math.hypot(dx2, dy2) * 1.05;
}

export function palmNormal(lm) {
  const w = new THREE.Vector3(lm[L.WRIST].x, lm[L.WRIST].y, lm[L.WRIST].z || 0);
  const i = new THREE.Vector3(lm[L.INDEX_MCP].x, lm[L.INDEX_MCP].y, lm[L.INDEX_MCP].z || 0);
  const p = new THREE.Vector3(lm[L.PINKY_MCP].x, lm[L.PINKY_MCP].y, lm[L.PINKY_MCP].z || 0);
  return i.sub(w).cross(p.sub(w)).normalize();
}
export function palmFacesCamera(lm) { return palmNormal(lm).z < -0.15; }

export function pinchDist2D(lm) {
  const dx = lm[L.THUMB_TIP].x - lm[L.INDEX_TIP].x;
  const dy = lm[L.THUMB_TIP].y - lm[L.INDEX_TIP].y;
  return Math.hypot(dx, dy);
}

// Angle (degrees) between thumb direction and index direction at MCP.
// Used for L_SHAPE (≈90°) and GUN_SHAPE (thumb up, index forward).
export function thumbIndexAngleDeg(lm) {
  const thumb = new THREE.Vector2(
    lm[L.THUMB_TIP].x - lm[L.THUMB_MCP].x,
    lm[L.THUMB_TIP].y - lm[L.THUMB_MCP].y,
  ).normalize();
  const index = new THREE.Vector2(
    lm[L.INDEX_TIP].x - lm[L.INDEX_MCP].x,
    lm[L.INDEX_TIP].y - lm[L.INDEX_MCP].y,
  ).normalize();
  const cos = THREE.MathUtils.clamp(thumb.dot(index), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

// ---------- Gesture predicates ----------
// Each predicate receives Features and returns {match: bool, confidence: 0..1}.
// Only used for the HELD (stateful) gestures — transient events (CLAP, SPREAD)
// are detected directly by GestureDetector from motion signals.

export const GESTURES = {
  POINT_DRAW: (f) => {
    // Permissive: index extended, thumb curled. Allow up to ONE of
    // middle/ring/pinky to drift up without dropping the pose — natural finger
    // tremor often flicks the middle finger during a point, which was cutting
    // strokes mid-draw.
    if (!f.fingers.index) return { match: false, confidence: 0 };
    if (f.fingers.thumb) return { match: false, confidence: 0 };
    const otherExtended =
      (f.fingers.middle ? 1 : 0) + (f.fingers.ring ? 1 : 0) + (f.fingers.pinky ? 1 : 0);
    if (otherExtended >= 2) return { match: false, confidence: 0 };
    return { match: true, confidence: otherExtended === 0 ? 0.92 : 0.7 };
  },

  PINCH_DRAW: (f) => {
    const pinched = f.pinchDist < 0.08;       // slightly looser pinch threshold
    if (!pinched) return { match: false, confidence: 0 };
    // skip when it's clearly an open-palm with thumb crossing index (false pinch)
    if (f.fingers.middle && f.fingers.ring && f.fingers.pinky) return { match: false, confidence: 0 };
    const conf = THREE.MathUtils.clamp(1 - f.pinchDist / 0.08, 0.4, 0.95);
    return { match: true, confidence: conf };
  },

  OPEN_PALM_ERASE: (f) => {
    const all5 = f.fingers.thumb && f.fingers.index && f.fingers.middle && f.fingers.ring && f.fingers.pinky;
    return all5 && f.palmFacesCamera
      ? { match: true, confidence: 0.88 } : { match: false, confidence: 0 };
  },

  FIST: (f) => {
    const none = !f.fingers.thumb && !f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky;
    return none ? { match: true, confidence: 0.85 } : { match: false, confidence: 0 };
  },

  THUMBS_UP: (f) => {
    // thumb extended, others curled; thumb tip clearly above the MCP row
    const only = f.fingers.thumb && !f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky;
    if (!only) return { match: false, confidence: 0 };
    // thumb tip y should be ABOVE index MCP (y smaller in image coords = higher)
    const above = f.lm[L.THUMB_TIP].y < f.lm[L.INDEX_MCP].y - 0.03;
    return above ? { match: true, confidence: 0.9 } : { match: false, confidence: 0 };
  },

  GUN_SHAPE: (f) => {
    // thumb extended AND pointing roughly up, index extended AND forward, others curled.
    if (!f.fingers.thumb || !f.fingers.index) return { match: false, confidence: 0 };
    if (f.fingers.middle || f.fingers.ring || f.fingers.pinky) return { match: false, confidence: 0 };
    const ang = thumbIndexAngleDeg(f.lm);
    // 60°..110° is a pretty wide angle between thumb (up) and index (forward)
    if (ang < 55 || ang > 115) return { match: false, confidence: 0 };
    return { match: true, confidence: 0.85 };
  },

  L_SHAPE: (f) => {
    // thumb + index extended, others curled, ~90° between them.
    if (!f.fingers.thumb || !f.fingers.index) return { match: false, confidence: 0 };
    if (f.fingers.middle || f.fingers.ring || f.fingers.pinky) return { match: false, confidence: 0 };
    const ang = thumbIndexAngleDeg(f.lm);
    if (ang < 70 || ang > 120) return { match: false, confidence: 0 };
    // L is angle close to 90°, gun is less strict on angle — disambiguate here:
    // only fire L when both the thumb and index are in screen plane (low z delta)
    const conf = 1 - Math.abs(90 - ang) / 30;
    return { match: conf > 0.4, confidence: THREE.MathUtils.clamp(conf, 0.55, 0.9) };
  },

  PEACE: (f) => {
    // index + middle extended, thumb/ring/pinky curled
    const ok = !f.fingers.thumb && f.fingers.index && f.fingers.middle && !f.fingers.ring && !f.fingers.pinky;
    return ok ? { match: true, confidence: 0.9 } : { match: false, confidence: 0 };
  },
};

// Priority when multiple single-hand predicates match (higher wins).
// Tuned so that:
//   - POINT beats pinch if all four other fingers are clearly curled
//   - PINCH beats PEACE when middle is mid-curl (avoids false PEACE during fast draw)
//   - GUN/L handled before POINT because they require thumb up and angle check
export const SINGLE_PRIORITY = {
  FIST: 100,
  OPEN_PALM_ERASE: 95,
  THUMBS_UP: 92,
  L_SHAPE: 88,
  GUN_SHAPE: 86,
  PEACE: 80,
  POINT_DRAW: 75,
  PINCH_DRAW: 70,
};
