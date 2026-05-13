// Webcam plane at z = -50, full-viewport, billboard. Custom shader dims +
// desaturates + vignettes so the feed reads as ghost reference, not subject.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AppState } from '../AppState.js';

export class WebcamBackdrop {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._build();
  }

  _build() {
    this.videoTexture = new THREE.VideoTexture(AppState.dom.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    const z = CONFIG.VIDEO_PLANE_Z;
    const { w, h } = this._planeSize(z);

    const geo = new THREE.PlaneGeometry(w, h);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map:        { value: this.videoTexture },
        uBrightness:{ value: CONFIG.VIDEO_BRIGHTNESS },
        uSaturation:{ value: CONFIG.VIDEO_SATURATION },
        uVignette:  { value: CONFIG.VIDEO_VIGNETTE },
        uContrast:  { value: CONFIG.VIDEO_CONTRAST ?? 1.0 },
        uMirror:    { value: AppState.mirror ? 1.0 : 0.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D map;
        uniform float uBrightness;
        uniform float uSaturation;
        uniform float uVignette;
        uniform float uContrast;
        uniform float uMirror;
        void main() {
          vec2 uv = vUv;
          if (uMirror > 0.5) uv.x = 1.0 - uv.x;
          vec3 c = texture2D(map, uv).rgb;
          // contrast around 0.5 midpoint BEFORE dimming so edges stay crisp
          c = (c - 0.5) * uContrast + 0.5;
          c *= uBrightness;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(lum), c, uSaturation);
          // radial vignette — darken edges
          vec2 p = vUv - 0.5;
          float r2 = dot(p, p) * 2.0;        // 0 center, ~0.5 at corner
          float vig = 1.0 - clamp(r2 * uVignette * 2.0, 0.0, 0.85);
          c *= vig;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,          // always behind everything
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.z = z;
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  _planeSize(z) {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const h = 2 * Math.tan(vFov / 2) * Math.abs(z);
    const w = h * this.camera.aspect;
    return { w, h };
  }

  onResize() {
    const { w, h } = this._planeSize(CONFIG.VIDEO_PLANE_Z);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(w, h);
  }

  setMirror(on) { this.mat.uniforms.uMirror.value = on ? 1 : 0; }

  update() {
    this.mat.uniforms.uBrightness.value = CONFIG.VIDEO_BRIGHTNESS;
    this.mat.uniforms.uSaturation.value = CONFIG.VIDEO_SATURATION;
    this.mat.uniforms.uVignette.value = CONFIG.VIDEO_VIGNETTE;
    this.mat.uniforms.uContrast.value = CONFIG.VIDEO_CONTRAST ?? 1.0;
  }
}
