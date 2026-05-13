// HandTracker — MediaPipe wrapper + camera acquisition + One-Euro smoothing.
// Emits AppState.handsDetected every frame with smoothed landmarks in [0,1]
// video-space. DepthMapper turns those into world coords.
//
// MediaPipe is loaded via classic <script> tags in index.html, setting
// window.Hands and window.Camera. Importing from '@mediapipe/hands' as ESM
// does not work under Vite — the package ships as a global-writing script.

import { AppState } from './AppState.js';
import { CONFIG } from './config.js';
import { HandSmoother } from './utils/OneEuroFilter.js';

// Lower resolution = faster MediaPipe inference + smaller texture upload = less
// latency on the classifier pipeline. 480x360 is the smallest size that still
// gives MediaPipe enough signal for reliable hand tracking.
const CAMERA_CANDIDATES = [
  { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
  { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
  {},
];

async function acquireStream(video) {
  for (const c of CAMERA_CANDIDATES) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', ...c },
        audio: false,
      });
      video.srcObject = stream;
      await new Promise(res => { video.onloadedmetadata = () => res(); });
      await video.play();
      const s = stream.getVideoTracks()[0].getSettings();
      return { stream, resolution: { width: s.width, height: s.height, fps: s.frameRate } };
    } catch (err) {
      console.debug('[camera] candidate failed', c, err?.name);
    }
  }
  throw new Error('No camera constraints worked');
}

export class HandTracker {
  constructor({ onReady, onError } = {}) {
    this.onReady = onReady;
    this.onError = onError;
    this.hands = null;
    this.camera = null;
    this.smoothers = {
      Left: new HandSmoother({ minCutoff: CONFIG.ONE_EURO_MIN_CUTOFF, beta: CONFIG.ONE_EURO_BETA }),
      Right: new HandSmoother({ minCutoff: CONFIG.ONE_EURO_MIN_CUTOFF, beta: CONFIG.ONE_EURO_BETA }),
    };
    this._lastSeen = { Left: 0, Right: 0 };
  }

  setSmoothingEnabled(on) {
    this.smoothers.Left.setEnabled(on);
    this.smoothers.Right.setEnabled(on);
  }
  setSmoothingParams(opts) {
    this.smoothers.Left.setParams(opts);
    this.smoothers.Right.setParams(opts);
  }

  async start() {
    const video = AppState.dom.video;
    if (!window.Hands || !window.Camera) {
      this.onError?.(new Error('MediaPipe scripts not loaded (check network/CDN)'));
      return;
    }
    try { await acquireStream(video); }
    catch (err) { this.onError?.(err); return; }

    this.hands = new window.Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      // Model 0 (lite, ~2MB) is 2-3x faster than model 1 (full, ~6MB) and
      // sufficient for finger-pose gestures. Drop to 0 for responsiveness.
      modelComplexity: 0,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55,
      selfieMode: false,
    });
    this.hands.onResults(r => this._onResults(r));

    this.camera = new window.Camera(video, {
      onFrame: async () => { await this.hands.send({ image: video }); },
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    });
    this.camera.start();
    this.onReady?.();
  }

  _onResults(res) {
    const tSec = performance.now() / 1000;
    const hands = [];
    const seenThisFrame = { Left: false, Right: false };

    if (res.multiHandLandmarks) {
      for (let i = 0; i < res.multiHandLandmarks.length; i++) {
        const raw = res.multiHandLandmarks[i];
        const handedness = res.multiHandedness?.[i]?.label || 'Right';
        const hand = AppState.mirror
          ? (handedness === 'Left' ? 'Right' : 'Left')
          : handedness;
        seenThisFrame[hand] = true;

        const lastSeen = this._lastSeen[hand];
        if (lastSeen && (tSec - lastSeen) > 0.3) this.smoothers[hand].reset();
        this._lastSeen[hand] = tSec;

        const lm = CONFIG.ONE_EURO_ENABLED
          ? this.smoothers[hand].smooth(raw, tSec)
          : raw;

        hands.push({
          landmarks: lm,
          worldLandmarks: res.multiHandWorldLandmarks?.[i] || null,
          hand,
          score: res.multiHandedness?.[i]?.score || 0.5,
        });
      }
    }
    for (const k of ['Left', 'Right']) {
      if (!seenThisFrame[k]) this.smoothers[k].reset();
    }

    AppState.handsDetected = hands;
    AppState.lastHandsTs = performance.now();
  }
}
