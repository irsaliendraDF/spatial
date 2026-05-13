// ColorWheel — HSV wheel floating at the L_SHAPE hand position. Palette
// preset row beneath it. Closing = L_SHAPE released or THUMBS_UP commit.
//
// Position: we project the hand's anchor world position through the camera
// to screen space and float the wheel there.
import { COLOR_PALETTE, CONFIG } from '../config.js';
import { AppState } from '../AppState.js';

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: [r,g,b] = [v,t,p]; break;
    case 1: [r,g,b] = [q,v,p]; break;
    case 2: [r,g,b] = [p,v,t]; break;
    case 3: [r,g,b] = [p,q,v]; break;
    case 4: [r,g,b] = [t,p,v]; break;
    case 5: [r,g,b] = [v,p,q]; break;
  }
  return [r, g, b];
}
function rgbToHex(r, g, b) {
  return (Math.round(r*255) << 16) | (Math.round(g*255) << 8) | Math.round(b*255);
}

export class ColorWheel {
  constructor({ bus }) {
    this.root = document.getElementById('color-wheel');
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this._drawWheel();
    this._open = false;
    this._lastHand = null;

    bus.on('L_SHAPE', (e) => this._onOpen(e));
    bus.on('THUMBS_UP', () => this._commit());
    bus.on('POINT_DRAW', () => this.hide());
    bus.on('PINCH_DRAW', () => this.hide());
    bus.on('FIST', () => this.hide());
  }

  _drawWheel() {
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - 6;
    const img = this.ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        const idx = (y * W + x) * 4;
        if (d > r) { img.data[idx+3] = 0; continue; }
        const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
        const sat = d / r;
        const [rr, gg, bb] = hsvToRgb(hue, sat, 1);
        img.data[idx+0] = rr * 255;
        img.data[idx+1] = gg * 255;
        img.data[idx+2] = bb * 255;
        img.data[idx+3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    // palette ring
    const N = COLOR_PALETTE.length;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * (r + 10);
      const py = cy + Math.sin(a) * (r + 10);
      // out of canvas — draw on DOM instead? skip for simplicity; the pick
      // happens by angle against the wheel only. Palette remains available
      // in SettingsPanel.
    }
  }

  _onOpen(evt) {
    this._open = true;
    this._lastHand = evt;
    // project to screen
    const v = evt.anchor.clone();
    v.project(AppState.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.root.style.display = 'block';
    this.root.style.left = `${x - 110}px`;
    this.root.style.top  = `${y - 110}px`;

    // use angle of hand relative to center to pick a hue
    // we read the hand's NDC angle so the user "rotates" around the wheel center
    // with their hand's XY delta from the center of the wheel.
    const nx = (x - window.innerWidth / 2);
    const ny = (y - window.innerHeight / 2);
    const hue = (Math.atan2(ny, nx) / (Math.PI * 2) + 1) % 1;
    const sat = 0.9;
    const [r, g, b] = hsvToRgb(hue, sat, 1);
    CONFIG.BRUSH_COLOR = rgbToHex(r, g, b);
  }

  _commit() { this.hide(); }
  hide() {
    if (!this._open) return;
    this._open = false;
    this.root.style.display = 'none';
  }
}
