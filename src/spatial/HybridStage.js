// HybridStage — the "volumetric set" surrounding the user. Fog, ground grid
// with radial alpha fade, key/rim/hemi lights, plus drifting atmospheric props.
// All meshes live under `group`; stage is excluded from .glb export.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class HybridStage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'stage';
    scene.add(this.group);

    this._buildFog();
    this._buildGround();
    this._buildLights();
    this._buildProps();
    this._tAccum = 0;
  }

  _buildFog() {
    this.scene.fog = new THREE.FogExp2(CONFIG.FOG_COLOR, CONFIG.FOG_DENSITY);
    this.scene.background = new THREE.Color(CONFIG.FOG_COLOR);
  }

  _buildGround() {
    // Large circular ground with a grid shader that fades to transparent at the
    // edge, so it never clips against the webcam plane.
    const geo = new THREE.CircleGeometry(16, 64);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uGridColor: { value: new THREE.Color(0x5ab8ff) },
        uBaseColor: { value: new THREE.Color(0x06101b) },
        uOpacity:   { value: CONFIG.GRID_OPACITY },
        uFadeRadius:{ value: 8.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision mediump float;
        varying vec2 vPos;
        uniform vec3 uGridColor;
        uniform vec3 uBaseColor;
        uniform float uOpacity;
        uniform float uFadeRadius;
        void main() {
          float r = length(vPos);
          // grid lines at 0.25m spacing, thin
          vec2 g = abs(fract(vPos * 4.0) - 0.5);
          float line = step(min(g.x, g.y), 0.03);
          // heavier line every 1m
          vec2 g2 = abs(fract(vPos * 1.0) - 0.5);
          float line2 = step(min(g2.x, g2.y), 0.012);
          float grid = max(line * 0.5, line2);
          // radial fade — opaque until ~6m, ramps to 0 at uFadeRadius
          float fade = 1.0 - smoothstep(uFadeRadius - 3.0, uFadeRadius, r);
          vec3 col = mix(uBaseColor, uGridColor, grid);
          gl_FragColor = vec4(col, uOpacity * fade);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8090b0, 0x1a1a2a, CONFIG.HEMI_INTENSITY);
    this.group.add(this.hemi);

    this.key = new THREE.DirectionalLight(0xffffff, CONFIG.KEY_LIGHT_INTENSITY);
    this.key.position.set(3, 5, 2);
    this.key.castShadow = CONFIG.SHADOWS_ENABLED;
    if (CONFIG.SHADOWS_ENABLED) {
      this.key.shadow.mapSize.set(512, 512);     // was 1024 — halved for perf
      this.key.shadow.camera.left = -5;
      this.key.shadow.camera.right = 5;
      this.key.shadow.camera.top = 5;
      this.key.shadow.camera.bottom = -5;
      this.key.shadow.camera.near = 0.1;
      this.key.shadow.camera.far = 20;
    }
    this.group.add(this.key);

    this.rim = new THREE.DirectionalLight(CONFIG.RIM_LIGHT_COLOR, CONFIG.RIM_LIGHT_INTENSITY);
    this.rim.position.set(-2, 4, -5);
    this.group.add(this.rim);
  }

  _buildProps() {
    this.props = [];
    // Earlier revisions placed 3 low-poly rocks and a large ring at eye level;
    // they sat in the user's working zone and read as junk. Removed — the
    // motes field alone carries the atmosphere, and the grid + fog define
    // the stage without foreground clutter.
    const count = 500;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      pos[i*3+0] = Math.cos(a) * r;
      pos[i*3+1] = Math.random() * 4 - 0.2;
      pos[i*3+2] = Math.sin(a) * r - 2;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x6ab4e8, size: 0.03, sizeAttenuation: true,
      transparent: true, opacity: 0.35, depthWrite: false,
    });
    this.motes = new THREE.Points(pGeo, pMat);
    this.group.add(this.motes);
  }

  update(dt) {
    this._tAccum += dt;

    // hot-update from CONFIG
    if (this.scene.fog) this.scene.fog.density = CONFIG.FOG_DENSITY;
    this.key.intensity = CONFIG.KEY_LIGHT_INTENSITY;
    this.rim.color.setHex(CONFIG.RIM_LIGHT_COLOR);
    this.rim.intensity = CONFIG.RIM_LIGHT_INTENSITY;
    this.hemi.intensity = CONFIG.HEMI_INTENSITY;
    this.ground.material.uniforms.uOpacity.value = CONFIG.GRID_OPACITY;

    // drift props gently
    for (const p of this.props) {
      if (p._drift) {
        p.position.y = -0.2 + Math.sin(this._tAccum * p._drift.speed * 2 + p._drift.phase) * 0.08;
        p.rotation.y += p._drift.speed * dt;
      }
    }
    if (this.ring) this.ring.rotation.z += 0.02 * dt;

    // spin motes cluster slowly
    if (this.motes) this.motes.rotation.y += 0.01 * dt;
  }
}
