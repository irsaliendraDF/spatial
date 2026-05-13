// Central tunables. Every slider in SettingsPanel writes directly into this object.
// Anything read per-frame comes from here so changes hot-update without reloads.
export const CONFIG = {
  // ---- Camera / world ----
  CAMERA_FOV: 55,
  WORLD_DEPTH: -1.2,            // default z where fingertips resolve to
  VIDEO_PLANE_Z: -50,            // webcam backdrop plane depth (far behind everything)

  // ---- Webcam hybrid look ----
  VIDEO_BRIGHTNESS: 0.65,        // bright enough to clearly see your hand
  VIDEO_SATURATION: 0.75,
  VIDEO_VIGNETTE: 0.25,
  VIDEO_CONTRAST: 1.25,          // higher contrast = hand stands out more

  // ---- Stage look ----
  FOG_DENSITY: 0.022,
  FOG_COLOR: 0x0a0e1a,
  KEY_LIGHT_INTENSITY: 1.0,
  RIM_LIGHT_COLOR: 0xff7a3c,
  RIM_LIGHT_INTENSITY: 0.6,
  HEMI_INTENSITY: 0.55,
  GRID_OPACITY: 0.35,

  // ---- Post-processing ----
  BLOOM_STRENGTH: 1.2,
  BLOOM_THRESHOLD: 0.35,
  BLOOM_RADIUS: 0.55,
  CHROMATIC_ABERRATION: 0.0006,
  FILM_GRAIN: 0.025,              // much less grain — was the "grainy" complaint
  AA_ENABLED: true,
  POST_BLOOM_ENABLED: true,
  POST_CHROMATIC_ENABLED: false,  // off by default — small perf win + cleaner look
  POST_GRAIN_ENABLED: false,      // off by default — can re-enable in Settings > Post
  SHADOWS_ENABLED: false,         // shadow maps are a significant GPU cost; off by default

  // ---- Gesture detection ----
  GESTURE_STABLE_FRAMES: 2,         // start firing faster (was 3)
  GESTURE_MISS_GRACE: 12,            // tolerate longer dropouts (was 7)
  GESTURE_CONFIDENCE_MIN: 0.5,
  TWO_HAND_STABILITY_FRAMES: 6,
  TWO_HAND_CONFIDENCE_MIN: 0.75,
  PINCH_DIST: 0.055,
  CLAP_DIST: 0.08,
  CLAP_VELOCITY: 0.5,

  // Per-gesture stability override (set by SettingsPanel)
  // key = gesture name; value = frames. Falls back to GESTURE_STABLE_FRAMES.
  // FIST requires a deliberate hold so brief finger curls during drawing
  // don't end strokes prematurely.
  GESTURE_FRAMES_OVERRIDE: { FIST: 6 },
  GESTURE_CONF_OVERRIDE: {},
  GESTURE_ENABLED: {},           // { name: false } disables

  // ---- Drawing ----
  BRUSH_PRESET: 'sparkle',
  BRUSH_COLOR: 0x7ae0ff,
  BRUSH_MIN_THICK: 0.006,
  BRUSH_MAX_THICK: 0.04,
  STROKE_DECIMATION: 0.012,      // smaller = more points = smoother line
  STROKE_SMOOTHING: 0,           // none — relying on One-Euro for smoothing, no blend lag
  PINCH_MAX_DIST: 0.10,          // normalized pinch above this -> zero pressure

  // ---- Depth mapping ----
  Z_GAIN: 1.3,
  Z_OFFSET: -1.2,
  Z_NEAR_CLAMP: -0.3,
  Z_FAR_CLAMP: -2.0,
  ONE_EURO_MIN_CUTOFF: 3.5,       // aggressive — almost no smoothing lag (was 1.8)
  ONE_EURO_BETA: 0.25,             // very responsive during motion (was 0.12)
  ONE_EURO_ENABLED: true,

  // ---- Objects ----
  OBJECT_LIBRARY_INDEX: 0,
  OBJECT_SNAP: false,
  OBJECT_SNAP_GRID: 0.10,
  OBJECT_ROT_SNAP_DEG: 15,
  OBJECT_FLOOR_SNAP: true,
  PHYSICS_ENABLED: false,
  PHYSICS_GRAVITY: -9.8,
  GRAB_DEADZONE_M: 0.02,
  GRAB_ROT_DEADZONE_DEG: 3,
  GRAB_RADIUS_M: 0.5,

  // ---- HUD / mode ----
  FOCUS_MODE: 'balanced',        // 'draw' | 'balanced' | 'object'
};

export const COLOR_PALETTE = [
  0x7ae0ff, 0x2fff70, 0xff7a3c, 0xff3a6a, 0xa864ff,
  0xffe066, 0xffffff, 0x000000,
];
