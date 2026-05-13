// One-Euro filter — low lag, kills jitter. Reference: Casiez et al. 2012.
// Ported from cinematic-gesture-fx.

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  constructor() { this.initialized = false; this.hatX = 0; }
  filter(x, a) {
    if (!this.initialized) { this.hatX = x; this.initialized = true; return x; }
    this.hatX = a * x + (1 - a) * this.hatX;
    return this.hatX;
  }
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.5, beta = 0.05, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
  }
  reset() { this.x.initialized = false; this.dx.initialized = false; this.lastT = null; }
  filter(value, tSec) {
    const dt = (this.lastT == null) ? 1 / 60 : Math.max(1e-4, tSec - this.lastT);
    this.lastT = tSec;
    const prevHat = this.x.initialized ? this.x.hatX : value;
    const dx = (value - prevHat) / dt;
    const edx = this.dx.filter(dx, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

// Per-hand wrapper: 63 filters (21 landmarks × xyz) in normalized space.
export class HandSmoother {
  constructor(opts) {
    this.filters = new Array(63);
    for (let i = 0; i < 63; i++) this.filters[i] = new OneEuroFilter(opts);
    this.enabled = true;
  }
  reset() { for (const f of this.filters) f.reset(); }
  setEnabled(on) { this.enabled = !!on; }
  setParams({ minCutoff, beta }) {
    for (const f of this.filters) {
      if (minCutoff != null) f.minCutoff = minCutoff;
      if (beta != null) f.beta = beta;
    }
  }
  smooth(landmarks, tSec) {
    if (!this.enabled) return landmarks;
    const out = new Array(landmarks.length);
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      out[i] = {
        x: this.filters[i * 3 + 0].filter(lm.x, tSec),
        y: this.filters[i * 3 + 1].filter(lm.y, tSec),
        z: this.filters[i * 3 + 2].filter(lm.z || 0, tSec),
      };
    }
    return out;
  }
}
