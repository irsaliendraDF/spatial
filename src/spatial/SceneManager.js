// SceneManager — owns renderer, scene, camera, composer, webcam backdrop,
// and the hybrid stage. Ports the "webcam plane as scene background" pattern
// from cinematic-gesture-fx, adapted for a dimmed ghost aesthetic.
//
// Scene graph:
//   scene
//   ├── WebcamBackdrop (z=-50, renderOrder=-1000)
//   ├── HybridStage group (fog, ground, lights, props) — NOT exported
//   └── stageGroup (strokes + objects) — EXPORTED to .glb
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';
import { WebcamBackdrop } from './WebcamBackdrop.js';
import { HybridStage } from './HybridStage.js';
import { PostFX } from './PostFX.js';

export class SceneManager {
  constructor() {}

  init() {
    const canvas = AppState.dom.threeCanvas;
    const w = window.innerWidth, h = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
    // Cap pixel ratio at 1.5 on high-DPI displays — big perf win, barely visible
    // difference through fog + post-processing.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(CONFIG.FOG_COLOR, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = CONFIG.SHADOWS_ENABLED;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;    // cheaper than PCFSoft

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, w / h, 0.1, 200);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    AppState.scene = this.scene;
    AppState.camera = this.camera;
    AppState.renderer = this.renderer;

    this.backdrop = new WebcamBackdrop(this.scene, this.camera);
    this.stage = new HybridStage(this.scene);

    // Group for user-generated content (strokes + objects). Exported to GLB.
    this.stageGroup = new THREE.Group();
    this.stageGroup.name = 'stage-content';
    this.scene.add(this.stageGroup);
    AppState.stageGroup = this.stageGroup;

    this.post = new PostFX(this.renderer, this.scene, this.camera);
    AppState.composer = this.post.composer;

    window.addEventListener('resize', () => this._onResize(), { passive: true });
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.backdrop.onResize();
  }

  setMirror(on) { this.backdrop.setMirror(on); }

  markBloom(obj) { this.post.markBloom(obj); }

  update(dt) {
    this.backdrop.update();
    this.stage.update(dt);
    this.post.update();
  }

  render() { this.post.render(); }
}
