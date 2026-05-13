// Spatial — main entry point. Wires hand tracking, gesture detection, the
// hybrid stage, drawing, object spawning/manipulation, physics, undo/redo,
// persistence, and the HUD into a single render loop.
//
// Keys:
//   H toggle HUD                 D debug landmarks
//   Space pause                  M mirror
//   Ctrl+Z undo / Ctrl+Y redo
//   1-8 library select           S save slot "default"   L load slot "default"
//   ,   settings panel           P cycle brush preset
//   G   toggle grid              B cycle brush (same as P)
//   [   cycle library ←          ]   cycle library →
import * as THREE from 'three';
import { AppState } from './AppState.js';
import { CONFIG } from './config.js';
import { SceneManager } from './spatial/SceneManager.js';
import { HandTracker } from './HandTracker.js';
import { DebugOverlay } from './DebugOverlay.js';
import { GestureDetector } from './gestures/GestureDetector.js';
import { GestureBus } from './gestures/GestureBus.js';
import { StrokeStore } from './drawing/StrokeStore.js';
import { StrokeEngine } from './drawing/StrokeEngine.js';
import { ObjectSpawner } from './objects/ObjectSpawner.js';
import { ObjectManipulator } from './objects/ObjectManipulator.js';
import { PhysicsWorld } from './objects/Physics.js';
import { UndoStack } from './io/UndoRedo.js';
import { SceneIO } from './io/SceneIO.js';
import { HUD } from './ui/HUD.js';
import { ColorWheel } from './ui/ColorWheel.js';
import { ModeToggle } from './ui/ModeToggle.js';
import { SettingsPanel, loadPersistedSettings } from './ui/SettingsPanel.js';
import { BRUSH_LIST } from './drawing/BrushPresets.js';
import { LIBRARY } from './objects/ObjectLibrary.js';

window.AppState = AppState;   // debugging

function bindDom() {
  AppState.dom.threeCanvas = document.getElementById('three-canvas');
  AppState.dom.debugCanvas = document.getElementById('debug-canvas');
  AppState.dom.video = document.getElementById('video');
}

function showPermPrompt(onRetry, msg) {
  const el = document.getElementById('perm');
  const m = document.getElementById('perm-msg');
  const btn = document.getElementById('perm-retry');
  el.style.display = 'flex';
  if (msg) m.textContent = msg;
  btn.onclick = () => { el.style.display = 'none'; onRetry(); };
}

async function main() {
  bindDom();

  // Restore persisted settings BEFORE constructing anything that reads CONFIG.
  const saved = loadPersistedSettings();
  for (const [k, v] of Object.entries(saved)) {
    if (k in CONFIG) CONFIG[k] = v;
    else if (k.endsWith('_OVERRIDE') || k === 'GESTURE_ENABLED') CONFIG[k] = v;
  }

  const sceneMgr = new SceneManager();
  sceneMgr.init();

  const bus = new GestureBus();
  const detector = new GestureDetector(bus);
  const debugOverlay = new DebugOverlay();

  const strokeStore = new StrokeStore(sceneMgr.scene, sceneMgr);
  const physics = new PhysicsWorld();
  const undo = new UndoStack({ strokeStore, spawner: null, sceneMgr });
  const spawner = new ObjectSpawner({ sceneMgr, bus, physics, undoStack: undo });
  undo.spawner = spawner;
  const manipulator = new ObjectManipulator({ spawner, physics, bus });

  const strokeEngine = new StrokeEngine({ sceneMgr, strokeStore, undoStack: undo, bus });

  const sceneIO = new SceneIO({ strokeStore, spawner, sceneMgr });
  const hud = new HUD();
  const colorWheel = new ColorWheel({ bus });
  const modeToggle = new ModeToggle({ spawner });
  const settings = new SettingsPanel({ sceneIO, handTracker: null });

  // OPEN_PALM_ERASE: sphere cast per frame at the palm position
  const ERASER_RADIUS = 0.12;
  bus.on('OPEN_PALM_ERASE', (e) => {
    strokeStore.eraseSphere(e.anchor, ERASER_RADIUS);
  });

  // TWO_HAND_FRAME: save screenshot
  bus.on('TWO_HAND_FRAME', () => {
    sceneMgr.render();        // ensure latest frame is drawn
    const data = sceneMgr.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = `spatial-${Date.now()}.png`;
    a.click();
    hud.flashSave('screenshot');
  });

  // CLAP -> undo, SPREAD -> redo
  bus.on('CLAP', () => undo.do());
  bus.on('SPREAD', () => undo.redoCmd());

  // Physics attachment on spawn
  spawner.onSpawned = (mesh) => {
    if (CONFIG.PHYSICS_ENABLED) physics.attach(mesh);
  };

  // --- camera / tracking ---
  const handTracker = new HandTracker({
    onReady: () => console.info('[hands] ready'),
    onError: (err) => {
      console.error('[hands] error', err);
      showPermPrompt(() => handTracker.start(), `Camera unavailable: ${err?.message || err}`);
    },
  });
  settings.handTracker = handTracker;
  handTracker.setSmoothingParams({
    minCutoff: CONFIG.ONE_EURO_MIN_CUTOFF,
    beta: CONFIG.ONE_EURO_BETA,
  });

  // Camera access requires user gesture in some browsers. Auto-try; fall back
  // to the perm prompt if it fails.
  handTracker.start().catch((err) => {
    showPermPrompt(() => handTracker.start(), err?.message);
  });

  // --- keyboard ---
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    // Settings panel intercepts its own keys
    if (e.key === ',') { e.preventDefault(); settings.toggle(); return; }

    if (settings.isOpen() && e.key === 'Escape') { settings.hide(); return; }

    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo.do(); return; }
    if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); undo.redoCmd(); return;
    }

    switch (e.key.toLowerCase()) {
      case 'h': hud.toggle(); break;
      case 'd': AppState.debugOverlay = !AppState.debugOverlay; break;
      case 'm': {
        AppState.mirror = !AppState.mirror;
        sceneMgr.setMirror(AppState.mirror);
        break;
      }
      case ' ': AppState.paused = !AppState.paused; break;
      case 't': modeToggle.cycle(); break;
      case 'p':
      case 'b': {
        const i = BRUSH_LIST.indexOf(CONFIG.BRUSH_PRESET);
        CONFIG.BRUSH_PRESET = BRUSH_LIST[(i + 1) % BRUSH_LIST.length];
        break;
      }
      case 's': {
        sceneIO.saveSlot('default').then(() => hud.flashSave());
        break;
      }
      case 'l': {
        sceneIO.loadSlot('default').then(() => hud.flashSave('loaded')).catch(() => {});
        break;
      }
      case '[': spawner._cycleLibrary(-1); break;
      case ']': spawner._cycleLibrary(+1); break;
    }
    // 1..8 library select
    const n = parseInt(e.key, 10);
    if (Number.isInteger(n) && n >= 1 && n <= LIBRARY.length) spawner.setLibraryIndex(n - 1);
  });

  // --- render loop ---
  let lastT = performance.now();
  let fpsAccum = 0, fpsCount = 0, fpsLastT = lastT;
  function frame() {
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    if (!AppState.paused) {
      detector.detect(sceneMgr.camera);
      strokeEngine.tick();
      physics.update(dt);
      // sync dynamic body positions back to their meshes
      for (const obj of spawner.getObjects()) physics.syncToMesh(obj);
      sceneMgr.update(dt);
    }

    sceneMgr.render();
    debugOverlay.render();
    hud.update();

    fpsAccum += 1; fpsCount += 1;
    if (t - fpsLastT >= 500) {
      AppState.fps = (fpsAccum / ((t - fpsLastT) / 1000));
      fpsAccum = 0; fpsLastT = t;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(err => {
  console.error(err);
  showPermPrompt(() => location.reload(), `Fatal: ${err?.message}`);
});
