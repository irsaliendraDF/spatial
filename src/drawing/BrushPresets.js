// Brush presets — material + optional sparkle decoration.
//
// Each preset returns:
//   { material, bloom: bool, decorate?: (mesh, stroke) => void }
//
// `decorate` runs after a stroke finishes — it can attach extra children
// (particle systems, etc.) onto the stroke mesh. The sparkle preset uses it
// to scatter twinkling emissive points along the curve.
import * as THREE from 'three';

export const BRUSH_LIST = ['sparkle', 'neon', 'chalk', 'ribbon', 'metallic', 'glow', 'smoke'];

// Chalk matcap — a simple radial gradient baked into a CanvasTexture.
function makeMatcap() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 50, 8, 64, 64, 64);
  g.addColorStop(0, '#f7e7c0');
  g.addColorStop(0.6, '#a69878');
  g.addColorStop(1, '#3a3222');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
let _matcap = null;
function getMatcap() { if (!_matcap) _matcap = makeMatcap(); return _matcap; }

// --- Pixie-dust sparkles (Disney-Channel wand trail) ---
// Four-point stars that twinkle, drift sideways and fall with mild gravity,
// then fade out and respawn on a per-point phase. Implemented as a custom
// ShaderMaterial on a Points primitive — much cheaper than InstancedMesh at
// this density (up to ~1000 per stroke) and natively billboarded.

// Build a 4-point star sprite (cross with glowing core) in a 128×128 canvas.
// Returns a CanvasTexture used as the Points' map.
function makeStarSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  // Soft outer glow — so the rays bleed into the background smoothly
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 56);
  glow.addColorStop(0, 'rgba(255,255,255,0.75)');
  glow.addColorStop(0.2, 'rgba(255,255,255,0.25)');
  glow.addColorStop(0.6, 'rgba(255,255,255,0.05)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 10;

  // Long horizontal + vertical rays
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(8, 64);  ctx.lineTo(120, 64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(64, 8);  ctx.lineTo(64, 120); ctx.stroke();

  // Shorter diagonal rays for the classic 4/8-point hybrid look
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(100, 100); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(100, 28); ctx.lineTo(28, 100); ctx.stroke();

  // Hot core dot — keeps star centers readable past the bloom pass
  ctx.shadowBlur = 0;
  const core = ctx.createRadialGradient(64, 64, 0, 64, 64, 9);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 128, 128);

  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}
let _starSprite = null;
function getStarSprite() { if (!_starSprite) _starSprite = makeStarSprite(); return _starSprite; }

function buildSparkleCluster(stroke, colorHex) {
  const ptsInput = stroke.points;
  if (!ptsInput || ptsInput.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(ptsInput, false, 'catmullrom', 0.35);
  // ~14 stars per input point — denser than the sphere version because stars
  // are 2D sprites (cheaper to render) and we want the trail to look abundant.
  const density = Math.max(140, Math.min(900, ptsInput.length * 14));
  const samples = curve.getSpacedPoints(density);

  const base = new THREE.Color(colorHex);
  const warmWhite = new THREE.Color(0xfff4d0);   // Disney-gold tinted white
  const white = new THREE.Color(0xffffff);

  const count = samples.length;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const baseR = stroke.radius ?? 0.02;
  const spreadR = baseR * 2.0;
  // Star sizes ~3×-30× the base tube radius — they appear as small stars
  // but bloom spreads them into larger halos.
  const minSize = baseR * 3.0;
  const maxSize = baseR * 28.0;

  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = samples[i];
    const u = Math.random(), v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = spreadR * Math.pow(Math.random(), 0.7);
    positions[i*3+0] = p.x + r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = p.y + r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = p.z + r * Math.cos(phi);

    seeds[i] = Math.random();
    const sizeBias = Math.pow(Math.random(), 2.0);
    sizes[i] = minSize + sizeBias * (maxSize - minSize);

    // Color mix: half warm-white (Disney gold), a quarter pure white cores,
    // a quarter brush-color accents. Adjust if user wants more saturation.
    const roll = Math.random();
    if (roll < 0.25) c.copy(white);
    else if (roll < 0.75) c.copy(warmWhite).lerp(base, 0.15);
    else c.copy(base).lerp(warmWhite, 0.45);
    colors[i*3+0] = c.r;
    colors[i*3+1] = c.g;
    colors[i*3+2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap:  { value: getStarSprite() },
      // physics-ish drift bounds (world units) — modest so shape of the trail stays recognizable
      uGravity:  { value: 0.12 },        // downward drift over one life cycle
      uWander:   { value: 0.04 },        // sideways wiggle amplitude
      uLifeSec:  { value: 3.2 },         // full fade-in → drift → fade-out cycle
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uGravity;
      uniform float uWander;
      uniform float uLifeSec;
      varying float vLife;
      varying float vTwinkle;
      varying vec3  vColor;

      void main() {
        float phase = aSeed;
        // normalized life position 0..1, offset per-point so they don't sync
        float t = mod(uTime / uLifeSec + phase, 1.0);
        vLife = t;

        // drift: quadratic fall, sinusoidal horizontal wander (figure-8 vibe)
        vec3 drift = vec3(
          sin(uTime * 1.1 + phase * 6.2831) * uWander * t,
          -uGravity * t * t,
          cos(uTime * 0.8 + phase * 7.91)   * uWander * t
        );
        vec3 wp = position + drift;

        // per-point twinkle: two sines at unrelated rates = organic shimmer
        float s1 = sin(uTime * 3.2 + phase * 6.2831);
        float s2 = sin(uTime * 5.4 + phase * 11.3);
        float twinkle = 0.3 + 0.7 * pow(0.5 + 0.5 * (s1 * 0.55 + s2 * 0.45), 2.0);
        vTwinkle = twinkle;

        // fade-in (first 12%) and fade-out (last 30%) — hides respawn
        float fadeIn  = smoothstep(0.0, 0.12, t);
        float fadeOut = 1.0 - smoothstep(0.70, 1.0, t);
        float fade = fadeIn * fadeOut;

        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        gl_PointSize = aSize * twinkle * fade * (420.0 / max(0.15, -mv.z));
        gl_Position = projectionMatrix * mv;

        vColor = aColor;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vLife;
      varying float vTwinkle;
      varying vec3  vColor;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        // fade alpha envelope again at the fragment level so tiny stars still ramp smoothly
        float fadeIn  = smoothstep(0.0, 0.12, vLife);
        float fadeOut = 1.0 - smoothstep(0.70, 1.0, vLife);
        float alpha = tex.a * fadeIn * fadeOut;
        vec3 col = vColor * (0.5 + 0.5 * vTwinkle);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  // advance uTime every render — keeps the animation running without a global loop
  points.onBeforeRender = () => {
    mat.uniforms.uTime.value = performance.now() * 0.001;
  };
  return points;
}

export function buildBrushMaterial(presetName, colorHex) {
  const col = new THREE.Color(colorHex);
  switch (presetName) {
    case 'sparkle': {
      // Disney-Channel wand trail: during drawing, a warm-white bloomed ribbon
      // follows the fingertip (the "wand streak"). On release, that ribbon
      // fades into a dim trail and a dense cloud of twinkling 4-point stars
      // is released along the path — each drifting/falling with its own phase.
      const warm = new THREE.Color(0xfff4d0);   // Disney gold tint
      const streak = col.clone().lerp(warm, 0.55);
      const material = new THREE.MeshBasicMaterial({
        color: streak,
        transparent: true,
        opacity: 0.55,                // bright enough to read as a wand streak
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      return {
        material,
        bloom: true,                  // the wand streak glows too
        decorate(mesh, stroke, sceneMgr) {
          const cluster = buildSparkleCluster(stroke, colorHex);
          if (cluster) {
            mesh.add(cluster);
            sceneMgr?.markBloom?.(cluster);
          }
          // Streak fades to a quiet residue once the stars do the work
          mesh.material.opacity = 0.15;
          mesh.material.needsUpdate = true;
        },
      };
    }

    case 'neon':
      return {
        material: new THREE.MeshBasicMaterial({
          color: col, toneMapped: false,
        }),
        bloom: true,
      };
    case 'chalk':
      return {
        material: new THREE.MeshMatcapMaterial({
          color: col.clone().multiplyScalar(1.2),
          matcap: getMatcap(),
        }),
        bloom: false,
      };
    case 'ribbon':
      return {
        material: new THREE.MeshStandardMaterial({
          color: col, roughness: 0.5, metalness: 0.1,
          side: THREE.DoubleSide, flatShading: true,
        }),
        bloom: false,
      };
    case 'metallic':
      return {
        material: new THREE.MeshPhysicalMaterial({
          color: col, metalness: 1.0, roughness: 0.2, clearcoat: 0.4,
        }),
        bloom: false,
      };
    case 'glow':
      return {
        material: new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }),
        bloom: true,
      };
    case 'smoke':
      return {
        material: new THREE.MeshStandardMaterial({
          color: col, roughness: 1, metalness: 0,
          transparent: true, opacity: 0.55, depthWrite: false,
        }),
        bloom: false,
      };
    default:
      return buildBrushMaterial('sparkle', colorHex);
  }
}
