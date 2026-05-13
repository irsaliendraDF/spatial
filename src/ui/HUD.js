// HUD — updates the DOM panels each frame from AppState + current gesture.
// Top-left: active gesture + confidence bar + fps/hands
// Top-right: tool interpretation + brush label + color swatch
// Bottom-center: object library strip (rebuilt on init, refreshed on cycle)
// Bottom-right: strokes/objects/undo/redo counts
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import { LIBRARY } from '../objects/ObjectLibrary.js';

export class HUD {
  constructor() {
    this.gestureEl = document.getElementById('gesture-name');
    this.confEl = document.getElementById('conf-fill');
    this.fpsEl = document.getElementById('fps');
    this.handsEl = document.getElementById('hands-n');
    this.toolEl = document.getElementById('tool-label');
    this.brushEl = document.getElementById('brush-label');
    this.swatchEl = document.getElementById('color-swatch');
    this.strokeEl = document.getElementById('stroke-count');
    this.objectEl = document.getElementById('object-count');
    this.undoEl = document.getElementById('undo-count');
    this.redoEl = document.getElementById('redo-count');
    this.libEl = document.getElementById('hud-library');

    this.saveToast = document.getElementById('save-toast');

    this.visible = true;
    this._buildLibrary();
  }

  _buildLibrary() {
    this.libEl.innerHTML = '';
    LIBRARY.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.index = i;
      el.innerHTML = `<span class="num">${i + 1}</span><span>${t.name}</span>`;
      this.libEl.appendChild(el);
    });
  }

  toggle() {
    this.visible = !this.visible;
    document.querySelectorAll('#hud-top-left, #hud-top-right, #hud-bottom-right, #hud-library, #mode-badge')
      .forEach(el => el.style.display = this.visible ? '' : 'none');
  }

  flashSave(label = 'saved') {
    this.saveToast.textContent = label;
    this.saveToast.style.display = 'block';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.saveToast.style.display = 'none', 1400);
  }

  // Per-frame refresh.
  update() {
    // Gesture + confidence
    const events = AppState.gestureEvents;
    let primary = null;
    for (const e of events) {
      if (!primary || (e.confidence > primary.confidence)) primary = e;
    }
    if (primary) {
      this.gestureEl.textContent = `${primary.name} · ${primary.hand}`;
      this.confEl.style.width = `${Math.round(primary.confidence * 100)}%`;
    } else {
      this.gestureEl.textContent = '—';
      this.confEl.style.width = '0%';
    }

    this.fpsEl.textContent = AppState.fps.toFixed(0);
    this.handsEl.textContent = String(AppState.handsDetected.length);

    // Tool label: inferred from current gesture
    this.toolEl.textContent = this._toolFromGesture(primary);
    this.brushEl.textContent = CONFIG.BRUSH_PRESET;
    this.swatchEl.style.background = '#' + CONFIG.BRUSH_COLOR.toString(16).padStart(6, '0');

    // Counts
    this.strokeEl.textContent = String(AppState.strokeCount);
    this.objectEl.textContent = String(AppState.objectCount);
    this.undoEl.textContent = String(AppState.undoDepth);
    this.redoEl.textContent = String(AppState.redoDepth);

    // Library highlight
    const active = CONFIG.OBJECT_LIBRARY_INDEX;
    [...this.libEl.children].forEach((el, i) => {
      el.classList.toggle('active', i === active);
    });
  }

  _toolFromGesture(evt) {
    if (!evt) return 'Idle';
    switch (evt.name) {
      case 'POINT_DRAW':
      case 'PINCH_DRAW':
        return `Drawing — ${CONFIG.BRUSH_PRESET}`;
      case 'GUN_SHAPE':
        return `Aiming — ${LIBRARY[CONFIG.OBJECT_LIBRARY_INDEX].name}`;
      case 'OPEN_PALM_ERASE':
        return 'Erasing';
      case 'FIST':
        return 'Paused (dead-man)';
      case 'THUMBS_UP':
        return 'Confirm';
      case 'L_SHAPE':
        return 'Color wheel';
      case 'PEACE':
        return 'Library cycle';
      case 'TWO_HAND_PINCH_GRAB':
        return 'Grab / rotate / scale';
      case 'TWO_HAND_FRAME':
        return 'Frame capture';
      default:
        return evt.name;
    }
  }
}
