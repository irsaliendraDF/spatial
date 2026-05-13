// 2D debug overlay. Toggled by D. Draws MediaPipe landmarks with per-hand
// connections, plus a small diagnostics line with the active gesture.
import { AppState } from './AppState.js';

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

export class DebugOverlay {
  constructor() {
    this.canvas = AppState.dom.debugCanvas;
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!AppState.debugOverlay) return;
    const W = this.canvas.width, H = this.canvas.height;
    for (const h of AppState.handsDetected) {
      const lm = h.landmarks;
      ctx.strokeStyle = h.hand === 'Right' ? '#7ae0ff' : '#ffd27a';
      ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        let ax = lm[a].x, bx = lm[b].x;
        if (AppState.mirror) { ax = 1 - ax; bx = 1 - bx; }
        ctx.beginPath();
        ctx.moveTo(ax * W, lm[a].y * H);
        ctx.lineTo(bx * W, lm[b].y * H);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < lm.length; i++) {
        const x = (AppState.mirror ? 1 - lm[i].x : lm[i].x) * W;
        const y = lm[i].y * H;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#cfefff';
      ctx.font = '12px monospace';
      const wx = (AppState.mirror ? 1 - lm[0].x : lm[0].x) * W;
      const wy = lm[0].y * H;
      ctx.fillText(`${h.hand} ${h.score.toFixed(2)}`, wx + 8, wy - 8);
    }
    if (AppState.gestureEvents.length) {
      ctx.fillStyle = '#7ae0ff';
      ctx.font = '11px monospace';
      let y = H - 10;
      for (const e of AppState.gestureEvents.slice(-6).reverse()) {
        ctx.fillText(`${e.name} · ${e.hand} · ${e.confidence.toFixed(2)}`, 12, y);
        y -= 14;
      }
    }
  }
}
