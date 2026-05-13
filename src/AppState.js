import * as THREE from 'three';

// Shared runtime state. Kept flat + mutable so modules can read/write directly
// without event plumbing for the things they all need (scene, camera, hands).
export const AppState = {
  dom: {
    threeCanvas: null,
    debugCanvas: null,
    video: null,
  },

  mirror: true,
  debugOverlay: false,
  paused: false,

  scene: null,
  stageGroup: null,      // group containing strokes + objects (exported to GLB)
  camera: null,
  renderer: null,
  composer: null,

  handsDetected: [],     // [{landmarks, hand:'Left'|'Right', score}]
  lastHandsTs: 0,
  smoothedWorld: {       // per-hand, per-landmark world positions (3D smoothed)
    Left: null,
    Right: null,
  },

  // gestures currently active this frame (for HUD display + downstream consumers)
  gestureEvents: [],     // per-frame dump from GestureDetector

  // counters for HUD
  strokeCount: 0,
  objectCount: 0,
  undoDepth: 0,
  redoDepth: 0,

  fps: 60,
  clock: new THREE.Clock(),
};
