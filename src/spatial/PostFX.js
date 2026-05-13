// PostFX — composer chain using pmndrs/postprocessing.
// Chain: Render → [Bloom pass] → [Chromatic pass] → [Noise + SMAA pass]
//
// Bloom and ChromaticAberration are "convolution" effects (they sample the
// framebuffer at offset positions) and can NOT share an EffectPass with each
// other or with non-convolution effects — postprocessing throws
// "Convolution effects cannot be merged". Each convolution gets its own pass.
// Noise + SMAA are plain per-pixel effects and can be merged.
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SelectiveBloomEffect,
  ChromaticAberrationEffect,
  NoiseEffect,
  SMAAEffect,
  BlendFunction,
} from 'postprocessing';
import { CONFIG } from '../config.js';

// Layer index we use for "should-bloom" meshes (strokes w/ emissive, glow).
export const BLOOM_LAYER = 2;

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this._build();
  }

  _build() {
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    composer.addPass(new RenderPass(this.scene, this.camera));

    // Selective bloom — only objects on BLOOM_LAYER contribute to bloom.
    this.bloom = new SelectiveBloomEffect(this.scene, this.camera, {
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      intensity: CONFIG.BLOOM_STRENGTH,
      luminanceThreshold: CONFIG.BLOOM_THRESHOLD,
      luminanceSmoothing: 0.1,
      radius: CONFIG.BLOOM_RADIUS,
    });
    // postprocessing's selective bloom uses its own selection set; we add meshes
    // by layer so: anything with BLOOM_LAYER enabled in its `layers` glows.
    this.bloom.inverted = false;
    this.bloom.ignoreBackground = true;

    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(CONFIG.CHROMATIC_ABERRATION, CONFIG.CHROMATIC_ABERRATION),
    });
    this.noise = new NoiseEffect({
      blendFunction: BlendFunction.OVERLAY,
    });
    this.noise.blendMode.opacity.value = CONFIG.FILM_GRAIN;

    this.smaa = new SMAAEffect();

    // Each convolution effect gets its own EffectPass.
    this.bloomPass = new EffectPass(this.camera, this.bloom);
    this.chromaticPass = new EffectPass(this.camera, this.chromatic);
    // Noise + SMAA are per-pixel; safe to merge.
    this.finalPass = new EffectPass(this.camera, this.noise, this.smaa);
    composer.addPass(this.bloomPass);
    composer.addPass(this.chromaticPass);
    composer.addPass(this.finalPass);

    this.composer = composer;
  }

  // Register a mesh/points/line to bloom.
  markBloom(obj) {
    obj.layers.enable(BLOOM_LAYER);
    if (this.bloom && this.bloom.selection) {
      this.bloom.selection.add(obj);
    }
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  render() { this.composer.render(); }

  update() {
    this.bloom.intensity = CONFIG.BLOOM_STRENGTH;
    if (this.bloom.luminanceMaterial) {
      this.bloom.luminanceMaterial.threshold = CONFIG.BLOOM_THRESHOLD;
    }
    this.bloom.mipmapBlurPass && (this.bloom.mipmapBlurPass.radius = CONFIG.BLOOM_RADIUS);
    this.chromatic.offset.set(CONFIG.CHROMATIC_ABERRATION, CONFIG.CHROMATIC_ABERRATION);
    this.noise.blendMode.opacity.value = CONFIG.FILM_GRAIN;

    // per-effect enable toggles
    this.bloom.blendMode.opacity.value = CONFIG.POST_BLOOM_ENABLED ? 1 : 0;
    this.chromatic.blendMode.opacity.value = CONFIG.POST_CHROMATIC_ENABLED ? 1 : 0;
    this.noise.blendMode.opacity.value = CONFIG.POST_GRAIN_ENABLED ? CONFIG.FILM_GRAIN : 0;
    this.smaa.blendMode.opacity.value = CONFIG.AA_ENABLED ? 1 : 0;
  }
}
