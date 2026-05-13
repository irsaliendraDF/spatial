// ModeToggle — HARD gate between drawing and object modes.
//
// 'draw'   → only drawing gestures fire (POINT_DRAW, PINCH_DRAW, OPEN_PALM_ERASE,
//            FIST, L_SHAPE, CLAP/SPREAD for undo/redo). Object gestures are disabled.
// 'object' → only object gestures fire (GUN_SHAPE, THUMBS_UP, PEACE, TWO_HAND_*,
//            FIST, CLAP/SPREAD). Drawing gestures disabled.
// 'both'   → everything live (the old behavior; kept for power users).
//
// Shared gestures (FIST dead-man, CLAP undo, SPREAD redo, OPEN_PALM_ERASE when
// drawing, TWO_HAND_FRAME for screenshots) fire in every mode.
//
// Implementation: we flip CONFIG.GESTURE_ENABLED[name] so GestureDetector's
// `isEnabled` check blocks predicates at evaluation time. Also flips
// spawner.clearGhost() when leaving object mode so a stale ghost doesn't linger.
import { CONFIG } from '../config.js';

const DRAW_GESTURES = ['POINT_DRAW', 'PINCH_DRAW', 'OPEN_PALM_ERASE', 'L_SHAPE'];
const OBJECT_GESTURES = ['GUN_SHAPE', 'THUMBS_UP', 'PEACE', 'PEACE_BOTH',
                         'TWO_HAND_PINCH_GRAB', 'TWO_HAND_PINCH_RELEASE'];

export class ModeToggle {
  constructor({ spawner } = {}) {
    this.spawner = spawner;
    this.el = document.getElementById('mode-badge');
    // default to 'draw' for the cleanest first experience
    if (!['draw', 'object', 'both'].includes(CONFIG.FOCUS_MODE)) {
      CONFIG.FOCUS_MODE = 'draw';
    }
    this._apply();
    this.el.addEventListener('click', () => this.cycle());
  }

  cycle() {
    const order = ['draw', 'object', 'both'];
    const i = order.indexOf(CONFIG.FOCUS_MODE);
    CONFIG.FOCUS_MODE = order[(i + 1) % order.length];
    this._apply();
  }

  _apply() {
    const m = CONFIG.FOCUS_MODE;
    const label = m === 'draw' ? 'DRAWING' : m === 'object' ? 'SHAPES' : 'BOTH';
    const hint = m === 'draw' ? 'click → shapes' : m === 'object' ? 'click → both' : 'click → drawing';
    this.el.innerHTML = `MODE · <b>${label}</b> <span style="opacity:.55;margin-left:6px;font-size:10px">${hint}</span>`;
    // color cue
    if (m === 'draw') this.el.style.color = '#7ae0ff';
    else if (m === 'object') this.el.style.color = '#ffd27a';
    else this.el.style.color = '#2fff70';

    // Hard-gate gestures via GESTURE_ENABLED (GestureDetector reads isEnabled()
    // for every predicate evaluation).
    CONFIG.GESTURE_ENABLED = CONFIG.GESTURE_ENABLED || {};
    const on = (name, v) => { CONFIG.GESTURE_ENABLED[name] = v; };

    if (m === 'draw') {
      for (const g of DRAW_GESTURES) on(g, true);
      for (const g of OBJECT_GESTURES) on(g, false);
      this.spawner?.clearGhost();
    } else if (m === 'object') {
      for (const g of DRAW_GESTURES) on(g, false);
      for (const g of OBJECT_GESTURES) on(g, true);
    } else {
      for (const g of [...DRAW_GESTURES, ...OBJECT_GESTURES]) on(g, true);
    }
  }
}
