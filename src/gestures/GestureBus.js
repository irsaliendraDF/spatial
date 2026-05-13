// Minimal pub/sub event bus for gesture events. Drawing, spawning, and UI
// subscribe by gesture name; each gets the full event {name, hand, confidence,
// anchor (Vector3 world), direction (Vector3), extra:{...}}.
export class GestureBus {
  constructor() {
    this.handlers = new Map();   // gestureName -> Set<fn>
    this.all = new Set();        // wildcard handlers
  }
  on(name, fn) {
    if (name === '*') { this.all.add(fn); return () => this.all.delete(fn); }
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.handlers.get(name).delete(fn);
  }
  emit(evt) {
    const set = this.handlers.get(evt.name);
    if (set) for (const fn of set) fn(evt);
    for (const fn of this.all) fn(evt);
  }
}
