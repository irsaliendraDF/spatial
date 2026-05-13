// SettingsPanel — ported shape from cinematic-gesture-fx (tabs, sliders,
// hot-update, localStorage persist). Rewritten tab content for the Spatial
// app: Drawing, Depth, Hybrid Look, Post, Objects, Gestures, Scene.
import { CONFIG, COLOR_PALETTE } from '../config.js';
import { BRUSH_LIST } from '../drawing/BrushPresets.js';
import { LIBRARY } from '../objects/ObjectLibrary.js';

const LS_KEY = 'spatial_settings';
const TABS = ['Drawing', 'Depth', 'Hybrid Look', 'Post', 'Objects', 'Gestures', 'Scene'];

function persistSetting(key, value) {
  try {
    const cur = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    cur[key] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(cur));
  } catch {}
}
export function loadPersistedSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

export class SettingsPanel {
  constructor({ sceneIO, handTracker }) {
    this.sceneIO = sceneIO;
    this.handTracker = handTracker;
    this.activeTab = 'Drawing';
    this._build();
    this._restore();
  }

  show() { this.root.style.display = 'flex'; this._renderTab(); }
  hide() { this.root.style.display = 'none'; }
  toggle() { this.root.style.display === 'flex' ? this.hide() : this.show(); }
  isOpen() { return this.root.style.display === 'flex'; }

  _restore() {
    const saved = loadPersistedSettings();
    for (const [k, v] of Object.entries(saved)) {
      if (k in CONFIG) CONFIG[k] = v;
      else if (k === 'GESTURE_FRAMES_OVERRIDE' || k === 'GESTURE_CONF_OVERRIDE' || k === 'GESTURE_ENABLED') {
        CONFIG[k] = v;
      }
    }
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'settings-panel';
    Object.assign(root.style, {
      position: 'fixed', inset: '0', display: 'none',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 10, 20, 0.7)', backdropFilter: 'blur(4px)',
      zIndex: 24,
    });
    root.addEventListener('click', e => { if (e.target === root) this.hide(); });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(640px, 92vw)', maxHeight: '86vh', overflow: 'hidden',
      borderRadius: '8px', border: '1px solid rgba(120, 220, 255, 0.5)',
      background: 'rgba(2, 18, 32, 0.95)', color: '#cfefff',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '13px',
      display: 'flex', flexDirection: 'column',
    });
    card.addEventListener('click', e => e.stopPropagation());

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #234">
        <h2 style="margin:0;color:#7ae0ff;font-size:15px;letter-spacing:2px">SETTINGS</h2>
        <button id="s-close" style="background:transparent;border:1px solid #7ae0ff66;color:#7ae0ff;padding:4px 10px;cursor:pointer;border-radius:3px">esc</button>
      </div>
      <div id="s-tabs" style="display:flex;gap:0;padding:0 18px;border-bottom:1px solid #234;flex-wrap:wrap"></div>
      <div id="s-body" style="padding:18px;overflow:auto;flex:1"></div>
      <div style="padding:10px 18px;border-top:1px solid #234;display:flex;justify-content:space-between">
        <button id="s-reset" style="background:transparent;border:1px solid #ff6a6a66;color:#ff8a8a;padding:6px 10px;cursor:pointer;border-radius:3px">Reset to defaults</button>
        <span style="opacity:0.55">Settings persist to localStorage</span>
      </div>
    `;
    root.appendChild(card);
    document.body.appendChild(root);
    this.root = root;
    this.body = card.querySelector('#s-body');

    const tabBar = card.querySelector('#s-tabs');
    for (const t of TABS) {
      const b = document.createElement('button');
      b.dataset.tab = t;
      b.className = 's-tab';
      b.textContent = t;
      b.style.cssText = 'background:transparent;border:none;border-bottom:2px solid transparent;color:#cfefff;padding:10px 12px;cursor:pointer;font-family:inherit;font-size:12px';
      b.onclick = () => { this.activeTab = t; this._renderTab(); };
      tabBar.appendChild(b);
    }

    card.querySelector('#s-close').onclick = () => this.hide();
    card.querySelector('#s-reset').onclick = () => {
      if (!confirm('Reset all settings to defaults?')) return;
      try { localStorage.removeItem(LS_KEY); } catch {}
      location.reload();
    };
  }

  _renderTab() {
    this.root.querySelectorAll('.s-tab').forEach(b => {
      b.style.borderBottomColor = b.dataset.tab === this.activeTab ? '#7ae0ff' : 'transparent';
      b.style.color = b.dataset.tab === this.activeTab ? '#7ae0ff' : '#cfefff';
    });
    this.body.innerHTML = '';
    const m = {
      'Drawing': () => this._renderDrawing(),
      'Depth': () => this._renderDepth(),
      'Hybrid Look': () => this._renderHybrid(),
      'Post': () => this._renderPost(),
      'Objects': () => this._renderObjects(),
      'Gestures': () => this._renderGestures(),
      'Scene': () => this._renderScene(),
    };
    m[this.activeTab]?.();
  }

  // ---- field helpers ----
  _slider(label, key, min, max, step) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px';
    const v = CONFIG[key];
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between"><span>${label}</span><span style="color:#7ae0ff" data-val>${(+v).toFixed(4).replace(/\.?0+$/,'')}</span></div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" style="width:100%"/>
    `;
    const input = wrap.querySelector('input');
    const valEl = wrap.querySelector('[data-val]');
    input.oninput = () => {
      const nv = parseFloat(input.value);
      CONFIG[key] = nv;
      valEl.textContent = nv.toFixed(4).replace(/\.?0+$/, '');
      persistSetting(key, nv);
      if (key === 'ONE_EURO_MIN_CUTOFF' || key === 'ONE_EURO_BETA') {
        this.handTracker?.setSmoothingParams({
          minCutoff: CONFIG.ONE_EURO_MIN_CUTOFF,
          beta: CONFIG.ONE_EURO_BETA,
        });
      }
    };
    this.body.appendChild(wrap);
  }
  _checkbox(label, key, onChange) {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;cursor:pointer';
    wrap.innerHTML = `<input type="checkbox" ${CONFIG[key] ? 'checked' : ''}/><span>${label}</span>`;
    wrap.querySelector('input').onchange = (e) => {
      CONFIG[key] = e.target.checked;
      persistSetting(key, e.target.checked);
      onChange?.(e.target.checked);
    };
    this.body.appendChild(wrap);
  }
  _select(label, options, current, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px;display:flex;gap:10px;align-items:center';
    wrap.innerHTML = `
      <span>${label}</span>
      <select style="background:#001a2a;color:#cfefff;border:1px solid #345;padding:4px 8px;border-radius:3px">
        ${options.map(o => `<option value="${o.id}" ${o.id===current?'selected':''}>${o.name}</option>`).join('')}
      </select>
    `;
    wrap.querySelector('select').onchange = (e) => onChange(e.target.value);
    this.body.appendChild(wrap);
  }
  _colorPalette(label, key) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px';
    wrap.innerHTML = `<div style="margin-bottom:6px">${label}</div><div style="display:flex;gap:6px" data-row></div>`;
    const row = wrap.querySelector('[data-row]');
    for (const hex of COLOR_PALETTE) {
      const s = document.createElement('div');
      s.style.cssText = `width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid ${CONFIG[key] === hex ? '#fff' : '#345'};background:#${hex.toString(16).padStart(6,'0')}`;
      s.onclick = () => {
        CONFIG[key] = hex;
        persistSetting(key, hex);
        this._renderTab();
      };
      row.appendChild(s);
    }
    this.body.appendChild(wrap);
  }
  _btn(label, onClick, style = '') {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `background:#003a5c;border:1px solid #7ae0ff;color:#dff6ff;padding:6px 12px;cursor:pointer;border-radius:3px;margin-right:8px;margin-bottom:8px;${style}`;
    b.onclick = onClick;
    this.body.appendChild(b);
    return b;
  }
  _info(html) {
    const d = document.createElement('div');
    d.style.cssText = 'opacity:0.7;margin-bottom:10px;font-size:12px';
    d.innerHTML = html;
    this.body.appendChild(d);
  }

  // ---- tabs ----
  _renderDrawing() {
    this._select('Brush preset', BRUSH_LIST.map(b => ({id: b, name: b})), CONFIG.BRUSH_PRESET, (v) => {
      CONFIG.BRUSH_PRESET = v; persistSetting('BRUSH_PRESET', v);
    });
    this._colorPalette('Base color', 'BRUSH_COLOR');
    this._slider('Min thickness', 'BRUSH_MIN_THICK', 0.001, 0.03, 0.001);
    this._slider('Max thickness', 'BRUSH_MAX_THICK', 0.005, 0.1, 0.001);
    this._slider('Smoothing', 'STROKE_SMOOTHING', 0, 0.9, 0.05);
    this._slider('Decimation distance (m)', 'STROKE_DECIMATION', 0.005, 0.08, 0.002);
  }
  _renderDepth() {
    this._slider('Z gain', 'Z_GAIN', 0.1, 3.0, 0.05);
    this._slider('Z offset', 'Z_OFFSET', -2.0, -0.3, 0.05);
    this._slider('One-Euro min cutoff', 'ONE_EURO_MIN_CUTOFF', 0.1, 5, 0.05);
    this._slider('One-Euro beta', 'ONE_EURO_BETA', 0, 0.5, 0.005);
    this._checkbox('One-Euro smoothing enabled', 'ONE_EURO_ENABLED', (on) => this.handTracker?.setSmoothingEnabled(on));
  }
  _renderHybrid() {
    this._slider('Webcam brightness', 'VIDEO_BRIGHTNESS', 0.05, 1.0, 0.02);
    this._slider('Webcam contrast', 'VIDEO_CONTRAST', 0.5, 2.0, 0.05);
    this._slider('Webcam saturation', 'VIDEO_SATURATION', 0, 1.5, 0.05);
    this._slider('Vignette strength', 'VIDEO_VIGNETTE', 0, 1.2, 0.05);
    this._slider('Fog density', 'FOG_DENSITY', 0.005, 0.12, 0.005);
    this._slider('Grid opacity', 'GRID_OPACITY', 0, 1, 0.05);
    this._slider('Key light intensity', 'KEY_LIGHT_INTENSITY', 0, 2, 0.05);
    this._slider('Rim light intensity', 'RIM_LIGHT_INTENSITY', 0, 2, 0.05);
    this._slider('Hemi light intensity', 'HEMI_INTENSITY', 0, 1.5, 0.05);
    this._checkbox('Shadows (reload required)', 'SHADOWS_ENABLED');
  }
  _renderPost() {
    this._checkbox('Bloom', 'POST_BLOOM_ENABLED');
    this._slider('Bloom strength', 'BLOOM_STRENGTH', 0, 3, 0.05);
    this._slider('Bloom threshold', 'BLOOM_THRESHOLD', 0, 1, 0.01);
    this._slider('Bloom radius', 'BLOOM_RADIUS', 0, 1.2, 0.05);
    this._checkbox('Chromatic aberration', 'POST_CHROMATIC_ENABLED');
    this._slider('Chromatic amount', 'CHROMATIC_ABERRATION', 0, 0.005, 0.0001);
    this._checkbox('Film grain', 'POST_GRAIN_ENABLED');
    this._slider('Grain strength', 'FILM_GRAIN', 0, 0.4, 0.01);
    this._checkbox('Antialiasing (SMAA)', 'AA_ENABLED');
  }
  _renderObjects() {
    this._checkbox('Snap to grid', 'OBJECT_SNAP');
    this._slider('Grid size (m)', 'OBJECT_SNAP_GRID', 0.025, 0.5, 0.025);
    this._slider('Rotation snap (deg)', 'OBJECT_ROT_SNAP_DEG', 5, 90, 5);
    this._checkbox('Floor snap', 'OBJECT_FLOOR_SNAP');
    this._checkbox('Physics enabled', 'PHYSICS_ENABLED');
    this._slider('Gravity', 'PHYSICS_GRAVITY', -30, 0, 0.5);
    this._select('Current library item', LIBRARY.map(l => ({id: l.id, name: l.name})),
      LIBRARY[CONFIG.OBJECT_LIBRARY_INDEX].id,
      (id) => { CONFIG.OBJECT_LIBRARY_INDEX = LIBRARY.findIndex(l => l.id === id); });
  }
  _renderGestures() {
    this._slider('Default stable frames', 'GESTURE_STABLE_FRAMES', 1, 18, 1);
    this._slider('Default confidence min', 'GESTURE_CONFIDENCE_MIN', 0.4, 0.95, 0.01);
    this._slider('Miss grace frames', 'GESTURE_MISS_GRACE', 1, 12, 1);

    this._info('Per-gesture overrides (empty = use default)');
    const names = [
      'POINT_DRAW', 'PINCH_DRAW', 'OPEN_PALM_ERASE', 'FIST', 'THUMBS_UP',
      'GUN_SHAPE', 'L_SHAPE', 'PEACE', 'TWO_HAND_PINCH_GRAB',
      'TWO_HAND_FRAME', 'CLAP', 'SPREAD', 'PEACE_BOTH',
    ];
    for (const name of names) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:160px 80px 80px 1fr;gap:6px;margin-bottom:6px;align-items:center';
      const enabled = CONFIG.GESTURE_ENABLED?.[name] !== false;
      const framesVal = CONFIG.GESTURE_FRAMES_OVERRIDE?.[name] ?? '';
      const confVal = CONFIG.GESTURE_CONF_OVERRIDE?.[name] ?? '';
      row.innerHTML = `
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${enabled?'checked':''} data-en/>${name}</label>
        <input type="number" min="1" max="24" placeholder="frames" value="${framesVal}" data-frames style="background:#001a2a;color:#cfefff;border:1px solid #345;padding:3px;width:60px"/>
        <input type="number" min="0" max="1" step="0.01" placeholder="conf" value="${confVal}" data-conf style="background:#001a2a;color:#cfefff;border:1px solid #345;padding:3px;width:60px"/>
        <span style="opacity:.6;font-size:11px" data-hint></span>
      `;
      const en = row.querySelector('[data-en]');
      const fr = row.querySelector('[data-frames]');
      const cf = row.querySelector('[data-conf]');
      en.onchange = () => {
        CONFIG.GESTURE_ENABLED[name] = en.checked;
        persistSetting('GESTURE_ENABLED', CONFIG.GESTURE_ENABLED);
      };
      fr.oninput = () => {
        const n = parseInt(fr.value, 10);
        if (!Number.isFinite(n)) delete CONFIG.GESTURE_FRAMES_OVERRIDE[name];
        else CONFIG.GESTURE_FRAMES_OVERRIDE[name] = n;
        persistSetting('GESTURE_FRAMES_OVERRIDE', CONFIG.GESTURE_FRAMES_OVERRIDE);
      };
      cf.oninput = () => {
        const v = parseFloat(cf.value);
        if (!Number.isFinite(v)) delete CONFIG.GESTURE_CONF_OVERRIDE[name];
        else CONFIG.GESTURE_CONF_OVERRIDE[name] = v;
        persistSetting('GESTURE_CONF_OVERRIDE', CONFIG.GESTURE_CONF_OVERRIDE);
      };
      this.body.appendChild(row);
    }
    this._checkbox('Debug landmark overlay (D)', 'debugOverlay_proxy', () => {});
    this.body.lastElementChild.querySelector('input').checked = window.AppState?.debugOverlay;
    this.body.lastElementChild.querySelector('input').onchange = (e) => {
      if (window.AppState) window.AppState.debugOverlay = e.target.checked;
    };
  }
  _renderScene() {
    this._btn('Save to "default"', async () => {
      await this.sceneIO.saveSlot('default');
      this._flash('Saved to slot "default"');
    });
    this._btn('Load "default"', async () => {
      try { await this.sceneIO.loadSlot('default'); this._flash('Loaded'); }
      catch (e) { this._flash(`Load failed: ${e.message}`); }
    });
    this._btn('Clear all', () => {
      if (!confirm('Delete all strokes + objects?')) return;
      this.sceneIO.strokeStore.clear();
      this.sceneIO.spawner.clearAll();
    });
    this._btn('Export .json', () => this.sceneIO.exportJson());
    this._btn('Export .glb', async () => { await this.sceneIO.exportGlb(); this._flash('GLB exported'); });

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json';
    importInput.style.marginTop = '10px';
    importInput.onchange = async () => {
      const f = importInput.files?.[0];
      if (f) { await this.sceneIO.importJsonFile(f); this._flash('Imported'); }
    };
    this.body.appendChild(importInput);
  }

  _flash(msg) {
    const el = document.getElementById('save-toast');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 1500);
  }
}
