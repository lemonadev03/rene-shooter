// waterCreature.js — photoreal seawater enemies for RENE SHOOTER.
//
// Eight creature kinds made of living seawater. Refraction is real:
// the body uses MeshPhysicalMaterial transmission (ior 1.33), so the
// scene behind bends through it. Foam, ripple and Fresnel rim are
// injected into that shader; per-creature life (squash, telegraphs,
// death) is CPU transforms, so ONE water material and per-kind shared
// geometries serve every instance. Steam / drips / rain are GPU point
// sprites driven by a shared time uniform — emission only writes a
// preallocated ring buffer. No per-frame allocations in update().
//
// Integrator costs: transmission forces one extra render of the opaque
// scene into a render target per frame (shared by all creatures).
// ~5-8 draw calls and ~3k body triangles per creature. Bodies do not
// cast shadows (wet disc grounds them). Recommended renderer setting:
// renderer.transmissionResolutionScale = 0.25 (reduced-res transmission
// target; the lab uses it and the refraction still reads at game range).
//
// API: createWaterCreature(kind 0..7, { scale }) ->
//   { group, radius, update(dt,t,{speed,state,inSea,inSun}),
//     hit(worldPoint,strength), startDeath()->seconds,
//     setShield(frac), dispose() }
// group feet sit at y=0 and the creature faces +Z.

import * as THREE from 'three';

// MON order from game.js: keep role, relative size `s`.
export const CREATURES = [
  { name: 'DROPLET',      s: 1.0,  radius: 0.58 },
  { name: 'TIDE BRUTE',   s: 1.7,  radius: 0.62 },
  { name: 'JETTER',       s: 1.15, radius: 0.56 },
  { name: 'SURFER',       s: 0.92, radius: 0.62 },
  { name: 'GUSHER',       s: 1.12, radius: 0.62 },
  { name: 'PUDDLER',      s: 1.3,  radius: 0.78 },
  { name: 'CORAL WARDEN', s: 1.25, radius: 0.62 },
  { name: 'RAIN SHAMAN',  s: 1.05, radius: 0.55 },
];
const DEATH_TIME = 1.6;

// ---------- shared shader time (written by every update; idempotent) ----------
const uTime = { value: 0 };

// ---------- tiny utils ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- canvas textures (coral shield stages, splash disc) ----------
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function coralTexture(crackLevel) {
  return canvasTex(512, (g, S) => {
    const r = rng(77 + crackLevel * 13);
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, '#f6a58e'); grad.addColorStop(0.55, '#ee7f6d'); grad.addColorStop(1, '#d95f57');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    // growth banding
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(255,238,220,${0.10 + r() * 0.16})`;
      g.lineWidth = 2 + r() * 7;
      g.beginPath();
      const y = r() * S;
      g.moveTo(0, y);
      for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 9 + (r() - 0.5) * 8);
      g.stroke();
    }
    // pits and barnacle specks
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(120,40,35,0.25)' : 'rgba(255,240,225,0.28)';
      g.beginPath(); g.arc(r() * S, r() * S, 0.7 + r() * 2.4, 0, 6.29); g.fill();
    }
    // cracks
    const cracks = crackLevel === 1 ? 5 : crackLevel === 2 ? 13 : 0;
    g.strokeStyle = 'rgba(38,16,14,0.85)';
    for (let i = 0; i < cracks; i++) {
      let x = S * (0.2 + r() * 0.6), y = S * (0.15 + r() * 0.6);
      g.lineWidth = crackLevel === 2 ? 2.6 : 1.7;
      g.beginPath(); g.moveTo(x, y);
      const n = 5 + (r() * 5 | 0);
      for (let k = 0; k < n; k++) { x += (r() - 0.5) * 90; y += r() * 55; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
const splashTex = canvasTex(256, (g, S) => {
  const r = rng(9);
  g.clearRect(0, 0, S, S);
  const c = S / 2;
  const grad = g.createRadialGradient(c, c, 4, c, c, c);
  grad.addColorStop(0, 'rgba(190,235,248,0.85)');
  grad.addColorStop(0.55, 'rgba(140,215,240,0.55)');
  grad.addColorStop(0.82, 'rgba(240,252,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(c, c, c, 0, 6.29); g.fill();
  // foam blotches near rim
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 130; i++) {
    const a = r() * 6.29, d = c * (0.62 + r() * 0.34);
    g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1.5 + r() * 5, 0, 6.29); g.fill();
  }
});

// ---------- shared materials ----------
const NOISE_GLSL = /* glsl */`
  float wcHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float wcNoise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(wcHash(i), wcHash(i + vec3(1,0,0)), f.x),
          mix(wcHash(i + vec3(0,1,0)), wcHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(wcHash(i + vec3(0,0,1)), wcHash(i + vec3(1,0,1)), f.x),
          mix(wcHash(i + vec3(0,1,1)), wcHash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
`;

const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0xdff6ff,
  metalness: 0,
  roughness: 0.06,
  transmission: 1.0,
  thickness: 0.6,
  attenuationColor: new THREE.Color(0xa8e6f2),
  attenuationDistance: 2.4,
  ior: 1.33,
  specularIntensity: 1.15,
  envMapIntensity: 1.3,
});
waterMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;
  shader.vertexShader = `
    uniform float uTime;
    attribute float aFoam;
    varying vec3 vWcObj;
    varying float vWcFoam;
    ${NOISE_GLSL}
  ` + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
    #include <begin_vertex>
    vWcObj = position;
    vWcFoam = aFoam;
    float wcSeed = dot(vec2(modelMatrix[3][0], modelMatrix[3][2]), vec2(1.71, 2.33));
    float wcRip = wcNoise(position * 5.5 + vec3(0.0, -uTime * 1.15, wcSeed)) - 0.5;
    float wcRip2 = sin(position.y * 14.0 - uTime * 3.4 + wcSeed + position.x * 7.0) * 0.35;
    transformed += normalize(normal) * (wcRip * 0.03 + wcRip2 * 0.01);
  `);
  shader.fragmentShader = `
    uniform float uTime;
    varying vec3 vWcObj;
    varying float vWcFoam;
    ${NOISE_GLSL}
  ` + shader.fragmentShader
    .replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      float wcFoamN = wcNoise(vWcObj * 10.0 + vec3(uTime * 0.7, -uTime * 1.9, uTime * 0.4));
      float wcFoam = smoothstep(0.62, 0.92, vWcFoam * (0.55 + wcFoamN * 0.75));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.99, 1.0, 1.0), wcFoam * 0.92);
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.88, wcFoam);
    `)
    .replace('#include <normal_fragment_maps>', /* glsl */`
      #include <normal_fragment_maps>
      vec3 wcP = vWcObj * 16.0;
      vec3 wcPert = vec3(
        sin(wcP.y * 1.7 - uTime * 3.1 + wcP.x),
        sin(wcP.x * 1.5 + uTime * 2.3 + wcP.z * 1.2),
        sin(wcP.z * 1.6 - uTime * 2.7 + wcP.y)) ;
      normal = normalize(normal + wcPert * 0.085 * (1.0 - wcFoam * 0.6));
    `)
    .replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      float wcRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance += vec3(0.45, 0.72, 0.85) * wcRim * 0.16;
    `);
};
waterMat.customProgramCacheKey = () => 'waterCreature-v1';

// Deep inner cores (opaque, so they render into the transmission target
// and are seen refracted through the shell).
const CORE_COLORS = [0x1d7595, 0x156a8a, 0x20829c, 0x228aa4, 0x18708f, 0x26738f, 0x1a7a90, 0x1e6f96];
// One shared material for everything solid inside/on the water shell
// (core, bubbles, sand, eyes, foam blobs), tinted per-vertex.
const solidMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.7,
});
const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, envMapIntensity: 0.55 });
const coralMats = [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({
  map: coralTexture(i), roughness: 0.62, metalness: 0, envMapIntensity: 0.7, side: THREE.DoubleSide,
}));
const coralBranchMat = new THREE.MeshStandardMaterial({ color: 0xf0836a, roughness: 0.7, metalness: 0, envMapIntensity: 0.6 });
const shellMat = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.38, metalness: 0, envMapIntensity: 0.9, side: THREE.DoubleSide });
const cloudMat = new THREE.MeshStandardMaterial({ color: 0x8fa3b5, roughness: 1, metalness: 0, envMapIntensity: 0.5 });
const splashMat = new THREE.MeshBasicMaterial({ map: splashTex, transparent: true, depthWrite: false, opacity: 0.9 });
const wetMat = new THREE.MeshBasicMaterial({ color: 0x7a643e, map: splashTex, transparent: true, opacity: 0.38, depthWrite: false });
const healMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

// GPU point sprites: steam (kind 0), drips/jets (1), looping rain (2).
const steamMat = new THREE.ShaderMaterial({
  uniforms: { uTime },
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */`
    uniform float uTime;
    attribute vec3 aVel;
    attribute vec4 aInfo; // birth, life, size, kind
    attribute vec3 aCol;
    varying vec3 vCol;
    varying float vAlpha;
    void main() {
      float birth = aInfo.x; float life = max(aInfo.y, 0.001);
      float size = aInfo.z; float kind = aInfo.w;
      float age = uTime - birth;
      float n = age / life;
      vec3 p = position;
      float grow = 1.0; float alpha = 0.0;
      if (kind < 0.5) {          // steam: rise, expand, fade
        if (n >= 0.0 && n < 1.0) {
          p += aVel * age + vec3(0.0, 0.55, 0.0) * age * age;
          p.x += sin(age * 5.0 + birth * 17.0) * 0.05 * age;
          grow = 1.0 + n * 2.4;
          alpha = smoothstep(0.0, 0.14, n) * (1.0 - smoothstep(0.5, 1.0, n)) * 0.55;
        }
      } else if (kind < 1.5) {   // drip / jet droplet: gravity
        if (n >= 0.0 && n < 1.0) {
          p += aVel * age + vec3(0.0, -3.4, 0.0) * age * age;
          alpha = (1.0 - smoothstep(0.7, 1.0, n)) * 0.9;
        }
      } else {                   // rain: loops forever
        float ln = fract(n);
        p += aVel * (ln * life);
        grow = 0.8;
        alpha = 0.75 * smoothstep(0.0, 0.08, ln) * (1.0 - smoothstep(0.9, 1.0, ln));
      }
      vCol = aCol;
      vAlpha = alpha;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = clamp(size * grow * (320.0 / max(0.4, -mv.z)), 0.0, 260.0);
      gl_Position = projectionMatrix * mv;
      if (alpha <= 0.0) gl_Position = vec4(0.0, 0.0, -10.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vCol;
    varying float vAlpha;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float a = smoothstep(0.5, 0.08, length(d)) * vAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vCol, a);
    }
  `,
});

// ---------- geometry helpers (all built once, shared) ----------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function xform(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.clone();
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m4);
  return g;
}
function setFoam(geo, fn) {
  const pos = geo.attributes.position;
  const foam = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) foam[i] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
  geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  return geo;
}
const _col = new THREE.Color();
function setColor(geo, hex) {
  _col.setHex(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function mergeGeos(list) {
  let vCount = 0, iCount = 0;
  const parts = list.map((g) => {
    const geo = g.index ? g : g.toNonIndexed();
    if (!geo.attributes.aFoam) setFoam(geo, () => 0);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    vCount += geo.attributes.position.count;
    iCount += geo.index.count;
    return geo;
  });
  const hasColor = parts.some((g) => g.attributes.color);
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2), foam = new Float32Array(vCount);
  const colArr = hasColor ? new Float32Array(vCount * 3).fill(1) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const geo of parts) {
    const n = geo.attributes.position.count;
    pos.set(geo.attributes.position.array, vo * 3);
    nor.set(geo.attributes.normal.array, vo * 3);
    uv.set(geo.attributes.uv.array, vo * 2);
    foam.set(geo.attributes.aFoam.array, vo);
    if (colArr && geo.attributes.color) colArr.set(geo.attributes.color.array, vo * 3);
    const gi = geo.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  if (colArr) out.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// Deform a sphere into a creature mass. fn(x,y,z unit sphere) -> [x,y,z].
function blob(r, w, h, fn, foamFn) {
  const geo = new THREE.SphereGeometry(r, w, h);
  const pos = geo.attributes.position;
  const foam = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const p = fn(x / r, y / r, z / r, x, y, z);
    pos.setXYZ(i, p[0], p[1], p[2]);
    foam[i] = foamFn ? foamFn(p[0], p[1], p[2], x / r, y / r, z / r) : 0;
  }
  geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  geo.computeVertexNormals();
  return geo;
}
// Base foam: churn at the skirt, flecks on up-facing crown.
const baseFoam = (floorY, crownY) => (x, y, z, ux, uy) =>
  clamp(smooth(floorY + 0.34, floorY + 0.02, y) * 1.15 + smooth(crownY - 0.25, crownY + 0.1, y) * Math.max(0, uy) * 0.55, 0, 1.2);

// Ring of foam blobs (merged) — reads at 30 m where shader foam cannot.
function foamRing(radius, y, count, blobR, seed, squashY = 0.24) {
  const r = rng(seed);
  const parts = [];
  const sGeo = new THREE.SphereGeometry(1, 8, 6);
  const n = Math.round(count * 1.35);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.45;
    const rad = radius * (0.8 + r() * 0.38);
    const s = blobR * (0.5 + r() * 0.6);
    parts.push(xform(sGeo, Math.cos(a) * rad, y * 0.35 + r() * 0.012, Math.sin(a) * rad, 0, r() * 3, 0, s * (1 + r() * 0.7), s * squashY, s));
  }
  return mergeGeos(parts);
}
function foamBlobsAt(list, seed) {
  const r = rng(seed);
  const sGeo = new THREE.SphereGeometry(1, 10, 8);
  return mergeGeos(list.map(([x, y, z, s]) =>
    xform(sGeo, x, y, z, r() * 3, r() * 3, 0, s * 1.15, s * (0.42 + r() * 0.2), s)));
}
// Two sunken glossy eyes, merged. Front is +Z.
function eyesGeo(cx, y, z, spread, rEye) {
  const sGeo = new THREE.SphereGeometry(1, 14, 10);
  const parts = [];
  for (const sd of [-1, 1]) {
    parts.push(xform(sGeo, cx + sd * spread * 0.85, y, z - rEye * 0.9, 0, sd * 0.35, sd * -0.3, rEye * 0.5, rEye * 0.66, rEye * 0.55));
  }
  return mergeGeos(parts);
}
const unitSphere = new THREE.SphereGeometry(1, 12, 9);
const discGeo = new THREE.CircleGeometry(1, 28);
const ringGeo = new THREE.RingGeometry(0.82, 1, 40);

// ---------- per-kind geometry (built once, lazily) ----------
const KIND_GEO = new Array(8).fill(null);
function kindGeo(kind) {
  if (KIND_GEO[kind]) return KIND_GEO[kind];
  let G;
  if (kind === 0) {
    // DROPLET: teardrop surging forward, flared skirt, swept crest fin.
    const body = blob(0.55, 26, 18, (ux, uy, uz) => {
      const taper = 1 - smooth(0.1, 1, uy) * 0.55;
      let x = ux * 0.52 * taper, z = uz * 0.52 * taper;
      let y = 0.58 + uy * 0.58 + smooth(0.4, 1, uy) * 0.16;
      z += smooth(0, 1, uy) * 0.14; // lean into the surge
      if (uy < -0.55) { const f = smooth(-0.55, -1, uy); x *= 1 + f * 0.35; z *= 1 + f * 0.35; y += f * 0.1; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.15));
    const fin = setFoam(xform(new THREE.ConeGeometry(0.16, 0.42, 10), 0, 1.18, -0.05, -0.65, 0, 0, 0.45, 1, 1),
      (x, y) => smooth(1.05, 1.4, y));
    // concept: spindly strider legs under the surging mass
    const legs = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const zz = 0.3 - i * 0.3;
      legs.push(setFoam(xform(new THREE.CylinderGeometry(0.018, 0.045, 0.62, 7),
        sd * 0.44, 0.24, zz, (i - 1) * 0.35, 0, sd * 0.85), (x, y) => smooth(0.25, 0.02, y) * 0.7));
    }
    G = {
      body: mergeGeos([body, fin, ...legs]),
      foam: foamRing(0.55, 0.045, 16, 0.085, 11),
      eyes: eyesGeo(0, 0.78, 0.47, 0.16, 0.062),
      coreScale: [0.7, 0.72, 0.7], corePos: [0, 0.5, 0.02],
      bubbleC: [0, 0.55, 0], bubbleR: [0.34, 0.42, 0.34], dripR: 0.52, dripY: 0.3,
    };
  } else if (kind === 1) {
    // TIDE BRUTE: hunched wave wall, pillar arms (separate pivots), foam mane.
    const body = blob(0.55, 28, 20, (ux, uy, uz) => {
      let x = ux * 0.78, z = uz * 0.58;
      let y = 0.72 + uy * 0.72;
      z += smooth(0.2, 1, uy) * 0.16; // hunch forward
      x *= 1 - smooth(0.5, 1, uy) * 0.22; // shoulder taper
      if (uy < -0.6) { const f = smooth(-0.6, -1, uy); x *= 1 + f * 0.2; z *= 1 + f * 0.25; y += f * 0.12; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.4));
    const armParts = [
      xform(new THREE.CylinderGeometry(0.15, 0.19, 0.85, 12), 0, -0.42, 0.02, 0.1, 0, 0),
      xform(unitSphere, 0, -0.88, 0.06, 0, 0, 0, 0.22, 0.18, 0.24), // fist
    ];
    armParts[0] = setFoam(armParts[0], (x, y) => smooth(-0.5, -1.0, y) * 0.8);
    armParts[1] = setFoam(armParts[1], () => 0.85);
    const mane = [];
    const mr = rng(31);
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = -0.55 + t * 1.1;
      mane.push([x, 1.26 + Math.sin(t * Math.PI) * 0.11 + mr() * 0.02, -0.18 + Math.cos(t * 6) * 0.05, 0.065 + mr() * 0.04]);
    }
    G = {
      body,
      arm: mergeGeos(armParts),
      foam: mergeGeos([foamRing(0.82, 0.05, 22, 0.11, 12), foamBlobsAt(mane, 13)]),
      eyes: eyesGeo(0, 0.98, 0.55, 0.24, 0.075),
      coreScale: [0.72, 0.7, 0.68], corePos: [0, 0.62, 0.03],
      bubbleC: [0, 0.7, 0], bubbleR: [0.5, 0.5, 0.36], dripR: 0.8, dripY: 0.35,
      armPos: 0.82, armY: 1.08,
    };
  } else if (kind === 2) {
    // JETTER: upright column + trumpet nozzle snout (separate, swells).
    const body = blob(0.55, 26, 18, (ux, uy, uz) => {
      const waist = 1 - Math.exp(-Math.pow((uy + 0.15) * 2.6, 2)) * 0.18;
      let x = ux * 0.5 * waist, z = uz * 0.5 * waist;
      let y = 0.74 + uy * 0.74;
      if (uy < -0.6) { const f = smooth(-0.6, -1, uy); x *= 1 + f * 0.4; z *= 1 + f * 0.4; y += f * 0.14; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.45));
    const nozzle = mergeGeos([
      setFoam(xform(unitSphere, 0, 0, 0.02, 0, 0, 0, 0.17, 0.17, 0.15), () => 0.15),
      setFoam(xform(new THREE.CylinderGeometry(0.072, 0.125, 0.62, 14), 0, 0, 0.36, Math.PI / 2, 0, 0),
        (x, y, z) => smooth(0.4, 0.68, z) * 0.5),
      setFoam(xform(new THREE.CylinderGeometry(0.175, 0.078, 0.22, 16), 0, 0, 0.76, Math.PI / 2, 0, 0),
        (x, y, z) => 0.55 + smooth(0.7, 0.88, z) * 0.5),
    ]);
    G = {
      body, nozzle,
      foam: foamRing(0.56, 0.045, 17, 0.085, 14),
      eyes: eyesGeo(0, 1.22, 0.42, 0.17, 0.06),
      coreScale: [0.68, 0.74, 0.68], corePos: [0, 0.66, 0],
      bubbleC: [0, 0.72, 0], bubbleR: [0.3, 0.52, 0.3], dripR: 0.52, dripY: 0.3,
      nozzlePos: [0, 0.92, 0.34],
    };
  } else if (kind === 3) {
    // SURFER: low bullet riding a curling wave lip.
    const body = blob(0.55, 30, 20, (ux, uy, uz) => {
      let x = ux * 0.4, z = uz * 0.78;
      let y = 0.6 + uy * 0.4;
      z += uy * 0.08;
      if (uy < -0.5) y += smooth(-0.5, -1, uy) * 0.12;
      return [x, Math.max(0.12, y), z];
    }, baseFoam(0.1, 0.9));
    // curling lip: tube swept along a curl in the YZ plane, widened in X
    const lipCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 1.02), new THREE.Vector3(0, 0.42, 1.0),
      new THREE.Vector3(0, 0.68, 0.78), new THREE.Vector3(0, 0.72, 0.45),
      new THREE.Vector3(0, 0.55, 0.28),
    ]);
    const lip = setFoam(
      xform(new THREE.TubeGeometry(lipCurve, 20, 0.13, 10), 0, -0.04, -0.14, 0, 0, 0, 2.6, 0.92, 1),
      (x, y, z) => clamp(smooth(0.35, 0.75, y) * 0.85 + smooth(0.55, 0.95, z) * 0.4, 0, 1.2));
    const sheet = setFoam(xform(unitSphere, 0, 0.16, 0.1, 0, 0, 0, 0.62, 0.13, 1.0),
      (x, y) => smooth(0.22, 0.05, y) * 0.7);
    const crest = setFoam(xform(new THREE.ConeGeometry(0.17, 0.5, 10), 0, 0.97, -0.22, -1.05, 0, 0, 0.4, 1, 1.15),
      (x, y) => smooth(0.85, 1.2, y));
    // concept: serpentine tail arcing up and over the back
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.52, -0.62), new THREE.Vector3(0, 0.85, -0.98),
      new THREE.Vector3(0, 1.22, -0.92), new THREE.Vector3(0, 1.38, -0.5),
      new THREE.Vector3(0, 1.3, -0.12),
    ]);
    const tail = setFoam(new THREE.TubeGeometry(tailCurve, 22, 0.075, 9),
      (x, y) => smooth(0.9, 1.35, y) * 0.8);
    const tailTip = setFoam(xform(new THREE.ConeGeometry(0.09, 0.34, 9), 0, 1.3, 0.02, 1.35, 0, 0, 0.5, 1, 1),
      () => 0.9);
    G = {
      body: mergeGeos([body, lip, sheet, crest, tail, tailTip]),
      foam: mergeGeos([
        foamBlobsAt([[0.52, 0.3, 0.82, 0.075], [0.2, 0.22, 0.95, 0.08], [-0.2, 0.22, 0.95, 0.08], [-0.52, 0.3, 0.82, 0.075], [0, 0.52, 0.62, 0.06]], 15),
        foamRing(0.72, 0.04, 18, 0.08, 16),
      ]),
      eyes: eyesGeo(0, 0.62, 0.72, 0.14, 0.055),
      coreScale: [0.66, 0.62, 0.7], corePos: [0, 0.48, 0.05],
      bubbleC: [0, 0.5, 0.05], bubbleR: [0.24, 0.26, 0.5], dripR: 0.6, dripY: 0.25,
    };
  } else if (kind === 4) {
    // GUSHER: bloated sphere, thin vent spout on top.
    const body = blob(0.55, 28, 20, (ux, uy, uz) => {
      let x = ux * 0.6, z = uz * 0.6;
      let y = 0.64 + uy * 0.6;
      if (uy < -0.65) { const f = smooth(-0.65, -1, uy); x *= 1 + f * 0.28; z *= 1 + f * 0.28; y += f * 0.16; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.2));
    const ventPts = [new THREE.Vector2(0.1, 0), new THREE.Vector2(0.055, 0.1), new THREE.Vector2(0.04, 0.2), new THREE.Vector2(0.07, 0.27)];
    const vent = setFoam(xform(new THREE.LatheGeometry(ventPts, 14), 0, 1.22, 0), () => 0.7);
    G = {
      body: mergeGeos([body, vent]),
      foam: foamRing(0.64, 0.045, 18, 0.09, 17),
      eyes: eyesGeo(0, 0.82, 0.56, 0.19, 0.065),
      coreScale: [0.74, 0.72, 0.74], corePos: [0, 0.6, 0],
      bubbleC: [0, 0.62, 0], bubbleR: [0.4, 0.4, 0.4], dripR: 0.6, dripY: 0.3,
      ventPos: [0, 1.52, 0],
    };
  } else if (kind === 5) {
    // PUDDLER: wide low puddle with twin humps (the two it splits into).
    const body = blob(0.55, 32, 20, (ux, uy, uz) => {
      let x = ux * 0.85, z = uz * 0.72;
      let y = 0.3 + uy * 0.28;
      const humps = Math.exp(-Math.pow((Math.abs(ux) - 0.45) * 2.4, 2)) * Math.max(0, uy);
      y += humps * 0.3;
      if (uy < -0.4) { const f = smooth(-0.4, -1, uy); x *= 1 + f * 0.22; z *= 1 + f * 0.22; y += f * 0.06; }
      return [x, Math.max(0.015, y), z];
    }, (x, y, z, ux, uy) => clamp(smooth(0.3, 0.03, y) * 1.1 + smooth(0.55, 0.8, y) * 0.5, 0, 1.2));
    G = {
      body,
      foam: foamRing(0.95, 0.04, 24, 0.09, 18),
      eyes: mergeGeos([
        eyesGeo(-0.42, 0.58, 0.5, 0.09, 0.048),
        eyesGeo(0.42, 0.58, 0.5, 0.09, 0.048),
      ]),
      coreScale: [0.78, 0.6, 0.72], corePos: [0, 0.26, 0],
      bubbleC: [0, 0.3, 0], bubbleR: [0.6, 0.2, 0.48], dripR: 0.9, dripY: 0.18,
    };
  } else if (kind === 6) {
    // CORAL WARDEN: stocky body behind a separate coral/shell shield.
    const body = blob(0.55, 26, 18, (ux, uy, uz) => {
      let x = ux * 0.58, z = uz * 0.55;
      let y = 0.66 + uy * 0.66;
      if (uy < -0.6) { const f = smooth(-0.6, -1, uy); x *= 1 + f * 0.3; z *= 1 + f * 0.3; y += f * 0.12; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.3));
    // curved shield plate: sphere cap segment, bulging toward +Z
    const plate = new THREE.SphereGeometry(1.05, 26, 18, Math.PI * 0.5 - 0.62, 1.24, Math.PI * 0.5 - 0.72, 1.44);
    const plateGeo = xform(plate, 0, 0, -1.02, 0, 0, 0, 1, 1.08, 1);
    // rim of shell + coral branches that snap off in stages
    const rimGeo = xform(new THREE.TorusGeometry(0.7, 0.038, 10, 30), 0, 0, 0.015, 0, 0, 0, 1, 1.05, 1);
    const branchOf = (x, y, z, rz, s) => mergeGeos([
      xform(new THREE.CylinderGeometry(0.018, 0.032, 0.26, 7), x, y + 0.11, z, 0.3, 0, rz, s),
      xform(unitSphere, x - Math.sin(rz) * 0.13 * s, y + 0.24 * s, z + 0.03, 0, 0, 0, 0.03 * s),
      xform(new THREE.CylinderGeometry(0.013, 0.02, 0.16, 7), x - Math.sin(rz) * 0.07 * s, y + 0.2 * s, z, 0.2, 0, rz + 0.7, s),
    ]);
    G = {
      body,
      foam: foamRing(0.6, 0.045, 18, 0.09, 19),
      eyes: eyesGeo(0, 1.02, 0.48, 0.19, 0.062),
      coreScale: [0.7, 0.7, 0.68], corePos: [0, 0.58, 0],
      bubbleC: [0, 0.62, 0], bubbleR: [0.36, 0.44, 0.34], dripR: 0.56, dripY: 0.3,
      shieldPlate: plateGeo,
      shieldRim: rimGeo,
      shieldChunks: [
        branchOf(-0.42, 0.42, 0.07, 0.5, 1),
        branchOf(0.44, 0.38, 0.07, -0.45, 1.1),
        branchOf(-0.1, 0.62, 0.05, 0.15, 0.9),
        branchOf(0.3, -0.5, 0.08, -0.8, 0.8),
      ],
      // concept: scallop shells studding the plate
      shieldShells: mergeGeos([
        xform(unitSphere, -0.3, -0.18, 0.055, 0.4, 0.3, 0, 0.1, 0.12, 0.03),
        xform(unitSphere, 0.34, 0.08, 0.05, -0.3, -0.4, 0, 0.085, 0.1, 0.028),
        xform(unitSphere, -0.06, 0.38, 0.04, 0.2, 0.8, 0, 0.07, 0.085, 0.025),
        xform(unitSphere, 0.12, -0.42, 0.06, 0.5, -0.2, 0, 0.08, 0.09, 0.028),
      ]),
      pearl: setFoam(xform(unitSphere, 0, 0.02, 0.14, 0, 0, 0, 0.11), () => 0),
      shieldPos: [0, 0.64, 0.55],
    };
  } else {
    // RAIN SHAMAN: tall funnel column, rain cloud floating above.
    const body = blob(0.55, 26, 19, (ux, uy, uz) => {
      const funnel = 0.62 + smooth(-1, 1, uy) * 0.55; // narrow base, flared crown
      let x = ux * 0.5 * funnel, z = uz * 0.5 * funnel;
      let y = 0.92 + uy * 0.92;
      x += Math.sin(uy * 2.4) * 0.05; // gentle S-curve
      if (uy < -0.7) { const f = smooth(-0.7, -1, uy); x *= 1 + f * 0.8; z *= 1 + f * 0.8; y += f * 0.16; }
      return [x, Math.max(0.015, y), z];
    }, baseFoam(0, 1.8));
    const cr = rng(41);
    const cloudParts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, d = i === 0 ? 0 : 0.24 + cr() * 0.22;
      const s = 0.24 + cr() * 0.14;
      cloudParts.push(xform(unitSphere, Math.cos(a) * d, (cr() - 0.5) * 0.1, Math.sin(a) * d * 0.8, 0, cr() * 3, 0, s, s * 0.55, s));
    }
    // concept: branching tendril arms raised to the cloud
    const tendrils = [];
    for (const sd of [-1, 1]) {
      tendrils.push(setFoam(xform(new THREE.CylinderGeometry(0.03, 0.065, 0.85, 8),
        sd * 0.52, 1.55, 0, 0, 0, sd * -0.95), (x, y) => smooth(1.6, 2.0, y) * 0.6));
      for (let f = 0; f < 3; f++) {
        tendrils.push(setFoam(xform(new THREE.CylinderGeometry(0.008, 0.024, 0.42, 6),
          sd * (0.88 + f * 0.07), 1.86, (f - 1) * 0.14, (f - 1) * 0.45, 0, sd * -0.5), () => 0.75));
      }
    }
    G = {
      body: mergeGeos([body, ...tendrils]),
      cloud: mergeGeos(cloudParts),
      foam: mergeGeos([
        foamRing(0.52, 0.045, 16, 0.08, 20),
        foamBlobsAt([[0.3, 1.78, 0.1, 0.05], [-0.28, 1.8, -0.05, 0.055], [0, 1.86, 0.18, 0.045]], 21),
      ]),
      eyes: eyesGeo(0, 1.42, 0.44, 0.15, 0.058),
      coreScale: [0.66, 0.78, 0.66], corePos: [0, 0.82, 0],
      bubbleC: [0, 0.9, 0], bubbleR: [0.26, 0.66, 0.26], dripR: 0.48, dripY: 0.4,
      cloudY: 2.22,
    };
  }
  // Solid innards + surface solids as ONE vertex-colored mesh:
  // deep core (body geo shrunk about its centre), bubbles, sand, eyes, foam.
  {
    const corePart = setColor(xform(new THREE.SphereGeometry(1, 16, 12),
      G.bubbleC[0], G.bubbleC[1], G.bubbleC[2],
      0, 0, 0, G.bubbleR[0] * 0.55, G.bubbleR[1] * 0.55, G.bubbleR[2] * 0.55), CORE_COLORS[kind]);
    const r = rng(1000 + kind * 7);
    const parts = [corePart, setColor(G.foam.clone(), 0xffffff), setColor(G.eyes.clone(), 0x0a141c)];
    const bGeo = new THREE.SphereGeometry(1, 6, 4);
    for (let i = 0; i < 15; i++) {
      parts.push(setColor(xform(bGeo,
        G.bubbleC[0] + (r() * 2 - 1) * G.bubbleR[0],
        Math.max(0.06, G.bubbleC[1] + (r() * 2 - 1) * G.bubbleR[1]),
        G.bubbleC[2] + (r() * 2 - 1) * G.bubbleR[2],
        0, 0, 0, 0.013 + r() * 0.026), 0xeaf7ff));
    }
    for (let i = 0; i < 8; i++) {
      parts.push(setColor(xform(bGeo,
        G.bubbleC[0] + (r() * 2 - 1) * G.bubbleR[0],
        Math.max(0.05, G.bubbleC[1] - G.bubbleR[1] * (0.4 + r() * 0.5)),
        G.bubbleC[2] + (r() * 2 - 1) * G.bubbleR[2],
        r() * 3, 0, 0, 0.011 + r() * 0.013), 0xc9a876));
    }
    G.solid = mergeGeos(parts);
  }
  KIND_GEO[kind] = G;
  return G;
}

// ---------- per-creature GPU points (steam / drips / rain) ----------
const PMAX = 170;
function makePoints(rainCount, cloudY, seed) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PMAX * 3);
  const vel = new Float32Array(PMAX * 3);
  const info = new Float32Array(PMAX * 4);
  const col = new Float32Array(PMAX * 3);
  for (let i = 0; i < PMAX; i++) { pos[i * 3 + 1] = -10; info[i * 4] = -100; info[i * 4 + 1] = 1; }
  const r = rng(seed);
  for (let i = 0; i < rainCount; i++) {
    // looping rain under the shaman cloud
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.55;
    pos.set([Math.cos(a) * d, cloudY - 0.12, Math.sin(a) * d * 0.85], i * 3);
    vel.set([0, -(cloudY - 0.05), 0], i * 3); // vel * life = full fall
    info.set([-r() * 0.6, 0.55 + r() * 0.25, 1.4, 2], i * 4);
    col.set([0.75, 0.9, 1], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
  const points = new THREE.Points(geo, steamMat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points, geo, pos, vel, info, col, cursor: rainCount };
}

// ---------- factory ----------
const _tmpV = new THREE.Vector3();
const _tmpM = new THREE.Matrix4();
let creatureSerial = 0;

export function createWaterCreature(kind, opts = {}) {
  kind = clamp(kind | 0, 0, 7);
  const def = CREATURES[kind];
  const scale = opts.scale !== undefined ? opts.scale : def.s;
  const G = kindGeo(kind);
  const serial = ++creatureSerial;

  const group = new THREE.Group();
  group.scale.setScalar(scale);
  const tilt = new THREE.Group();            // lean / lunge pivot at feet
  const squashG = new THREE.Group();         // squash-and-stretch volume
  group.add(tilt); tilt.add(squashG);

  const body = new THREE.Mesh(G.body, waterMat); // no castShadow: water casts caustics, not a solid shadow; the wet disc grounds it
  const solid = new THREE.Mesh(G.solid, solidMat); // core + bubbles + sand + eyes + foam, one draw
  squashG.add(solid, body);

  // wet patch + splash disc (in group space, not squashed)
  const wet = new THREE.Mesh(discGeo, wetMat);
  wet.rotation.x = -Math.PI / 2; wet.position.y = 0.012; wet.renderOrder = 1;
  wet.scale.setScalar(G.dripR * 1.7);
  const splash = new THREE.Mesh(discGeo, splashMat);
  splash.rotation.x = -Math.PI / 2; splash.position.y = 0.03; splash.renderOrder = 2;
  splash.scale.setScalar(0.001);
  splash.visible = false;
  group.add(wet, splash);

  // foam flash at hit point
  const flash = new THREE.Mesh(unitSphere, foamMat);
  flash.visible = false; flash.renderOrder = 5;
  group.add(flash);

  // kind-specific articulated parts
  let armL = null, armR = null, nozzle = null, shield = null, shieldPlate = null,
    shieldChunks = null, cloud = null, healRing = null;
  if (kind === 1) {
    const mkArm = (sd) => {
      const pivot = new THREE.Group();
      pivot.position.set(sd * G.armPos, G.armY, 0.05);
      const m = new THREE.Mesh(G.arm, waterMat);
      pivot.add(m);
      pivot.rotation.z = sd * 0.22;
      squashG.add(pivot);
      return pivot;
    };
    armL = mkArm(-1); armR = mkArm(1);
  } else if (kind === 2) {
    nozzle = new THREE.Group();
    nozzle.position.set(G.nozzlePos[0], G.nozzlePos[1], G.nozzlePos[2]);
    const m = new THREE.Mesh(G.nozzle, waterMat);
    m.rotation.x = -0.06; // slight droop
    nozzle.add(m);
    squashG.add(nozzle);
  } else if (kind === 6) {
    shield = new THREE.Group();
    shield.position.set(G.shieldPos[0], G.shieldPos[1], G.shieldPos[2]);
    shieldPlate = new THREE.Mesh(G.shieldPlate, coralMats[0]);
    shieldPlate.castShadow = true;
    const rim = new THREE.Mesh(G.shieldRim, shellMat);
    const pearl = new THREE.Mesh(G.pearl, shellMat);
    const shells = new THREE.Mesh(G.shieldShells, shellMat);
    shield.add(shieldPlate, rim, pearl, shells);
    shieldChunks = G.shieldChunks.map((cg) => {
      const m = new THREE.Mesh(cg, coralBranchMat);
      shield.add(m);
      return m;
    });
    squashG.add(shield);
  } else if (kind === 7) {
    cloud = new THREE.Mesh(G.cloud, cloudMat);
    cloud.position.y = G.cloudY;
    squashG.add(cloud);
    healRing = new THREE.Mesh(ringGeo, healMat.clone()); // per-shaman opacity
    healRing.rotation.x = -Math.PI / 2;
    healRing.position.y = 0.05;
    healRing.renderOrder = 3;
    group.add(healRing);
  }

  const rainCount = kind === 7 ? 42 : 0;
  const pts = makePoints(rainCount, kind === 7 ? G.cloudY : 0, 5000 + serial * 31);
  group.add(pts.points);

  const S = {
    phase: (serial * 1.618) % (Math.PI * 2),
    walkPhase: 0, wind: 0, attackT: -1, hurtT: 0,
    q: 0, qv: 0,           // squash spring (extra deform, 0 = rest)
    dying: false, deathT: 0, dead: false,
    shieldFrac: 1, shieldFall: 0,
    dripT: 0.1 + (serial % 5) * 0.05, steamT: 0,
    flashT: 0, splash: 0, healT: (serial % 7) * 0.5,
    emitR: rng(9000 + serial * 17),
    prevState: 'idle',
  };

  function emit(x, y, z, vx, vy, vz, birth, life, size, pkind, rC, gC, bC) {
    const i = pts.cursor;
    pts.cursor = rainCount + ((pts.cursor - rainCount + 1) % (PMAX - rainCount));
    pts.pos.set([x, y, z], i * 3);
    pts.vel.set([vx, vy, vz], i * 3);
    pts.info.set([birth, life, size, pkind], i * 4);
    pts.col.set([rC, gC, bC], i * 3);
    pts.dirty = true;
  }
  function emitSteam(cx, cy, cz, n, t, spread, baseSize) {
    const r = S.emitR;
    for (let k = 0; k < n; k++) {
      emit(cx + (r() - 0.5) * spread, cy + (r() - 0.5) * spread, cz + (r() - 0.5) * spread,
        (r() - 0.5) * 0.7, 0.5 + r() * 0.9, (r() - 0.5) * 0.7,
        t, 0.9 + r() * 0.9, baseSize * (0.7 + r() * 0.7), 0, 0.97, 0.99, 1);
    }
  }
  function emitSplashBurst(t, n, power) {
    const r = S.emitR;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, sp = (0.4 + r() * 1.1) * power;
      emit(Math.cos(a) * G.dripR * 0.5, 0.06, Math.sin(a) * G.dripR * 0.5,
        Math.cos(a) * sp, 1 + r() * 1.6 * power, Math.sin(a) * sp,
        t, 0.5 + r() * 0.35, 2.4 + r() * 2, 1, 0.8, 0.94, 1);
    }
  }

  function update(dt, t, o) {
    uTime.value = t;
    if (S.dead) return;
    dt = Math.min(dt, 0.05);
    const speed = o && o.speed ? o.speed : 0;
    const state = o && o.state ? o.state : 'idle';
    const inSea = !!(o && o.inSea);
    const inSun = !!(o && o.inSun);
    const spN = clamp(speed / 4, 0, 1.4);
    const ph = S.phase;

    // ----- state timers -----
    if (state === 'attack' && S.prevState !== 'attack' && !S.dying) { S.attackT = 0; S.attackFired = false; }
    S.prevState = state;
    const windTarget = !S.dying && state === 'windup' ? 1 : 0;
    S.wind += (windTarget - S.wind) * Math.min(1, dt * (windTarget ? 4.5 : 7));
    const w = S.wind;
    if (S.hurtT > 0) S.hurtT -= dt;
    if (state === 'hurt' && S.hurtT <= 0) { S.hurtT = 0.3; S.qv -= 3.2; }
    if (S.attackT >= 0) {
      S.attackT += dt / 0.5;
      const p = S.attackT;
      const fireAt = kind === 1 ? 0.45 : 0.12;
      if (!S.attackFired && p >= fireAt) {
        S.attackFired = true;
        if (kind === 1) { emitSplashBurst(t, 26, 1.7); S.splash = 1; S.qv -= 2.4; }
        else if (kind === 2) {
          const r = S.emitR;
          for (let k = 0; k < 14; k++) {
            emit((r() - 0.5) * 0.12, 0.94 + (r() - 0.5) * 0.12, 1.25,
              (r() - 0.5) * 0.8, 0.4 + r() * 0.6, 5.5 + r() * 3,
              t, 0.55, 2.6 + r() * 1.6, 1, 0.72, 0.9, 1);
          }
          S.qv -= 1.6;
        } else if (kind === 4) {
          emitSplashBurst(t, 22, 1.3); S.splash = 1;
          emitSteam(G.ventPos[0], G.ventPos[1], G.ventPos[2], 8, t, 0.15, 5);
        } else if (kind === 7) { S.healT = 0; }
        else { emitSplashBurst(t, 8, 0.8); if (kind !== 3) S.splash = Math.max(S.splash, 0.5); }
      }
      if (p >= 1) S.attackT = -1;
    }
    const atkP = S.attackT >= 0 ? clamp(S.attackT, 0, 1) : 0;
    const strike = Math.sin(Math.min(atkP * 1.12, 1) * Math.PI);

    // ----- squash spring -----
    S.qv += (-95 * S.q - 11 * S.qv) * dt;
    S.q = clamp(S.q + S.qv * dt, -0.45, 0.45);

    // ----- locomotion / breathing -----
    S.walkPhase += dt * (1.5 + speed * 1.7) * (spN > 0.02 ? 1 : 0);
    const breathe = Math.sin(t * 2.1 + ph) * 0.018;
    const walkBob = Math.abs(Math.sin(S.walkPhase)) * 0.07 * spN;
    const walkSquash = Math.sin(S.walkPhase * 2) * 0.045 * spN;

    let sx = 1, sy = 1, sz = 1, lean = spN * 0.13, liftY = walkBob, lungeZ = 0;
    sy += breathe + walkSquash + S.q;
    sx += -breathe * 0.7 - walkSquash * 0.6 - S.q * 0.65;
    sz = sx;
    if (S.hurtT > 0) { const h = S.hurtT / 0.3; lean -= h * 0.18; }

    // ----- windup telegraphs + attack poses -----
    if (kind === 1) {
      const sway = Math.sin(S.walkPhase) * 0.22 * spN;
      let raise = lerp(0.12, -2.35, w);
      if (S.attackT >= 0) raise = lerp(-2.35, 0.6, smooth(0.3, 0.48, atkP)) + lerp(0, -0.45, smooth(0.48, 1, atkP)) * 0;
      if (S.attackT >= 0 && atkP > 0.48) raise = lerp(0.6, 0.12, smooth(0.55, 1, atkP));
      armL.rotation.x = raise + sway; armR.rotation.x = raise - sway;
      armL.rotation.z = -0.22 - w * 0.25; armR.rotation.z = 0.22 + w * 0.25;
      lean -= w * 0.17; liftY += w * 0.1; sy += w * 0.05;
      if (S.attackT >= 0) { lean += smooth(0.3, 0.5, atkP) * 0.22; liftY -= smooth(0.3, 0.5, atkP) * 0.12; }
    } else if (kind === 2) {
      const ns = 1 + w * 0.5 - strike * 0.22;
      nozzle.scale.set(ns, ns, 1 + w * 0.25 - strike * 0.3);
      sy -= w * 0.08; sx += w * 0.05; sz = sx; lean -= w * 0.1;
      lungeZ -= strike * 0.12;
    } else if (kind === 3) {
      sy -= w * 0.16; lean -= w * 0.2; lungeZ -= w * 0.3;
      lungeZ += strike * 0.85; lean += strike * 0.1;
    } else if (kind === 4) {
      const bloat = 1 + w * 0.3 + Math.sin(t * 21 + ph) * 0.022 * w + strike * 0.1;
      sx *= bloat; sy *= bloat; sz *= bloat;
    } else if (kind === 5) {
      sy += w * 0.32; sx -= w * 0.06; sz -= w * 0.06;
    } else if (kind === 6) {
      lean += w * 0.07;
      if (shield && S.shieldFrac > 0) {
        shield.position.z = G.shieldPos[2] + w * 0.09;
        shield.position.y = G.shieldPos[1] + w * 0.05;
      }
    } else if (kind === 7) {
      sy += w * 0.1;
      if (cloud) { const cs = 1 + w * 0.18; cloud.scale.set(cs, 1, cs); }
    } else {
      sy -= w * 0.18; sx += w * 0.1; sz = sx; lean -= w * 0.12;
    }
    if (kind !== 1 && kind !== 2 && kind !== 3 && S.attackT >= 0) {
      lean += strike * 0.2; lungeZ += strike * 0.22;
    }

    // ----- death: boil, then collapse into splash -----
    if (S.dying) {
      S.deathT += dt / DEATH_TIME;
      const d = clamp(S.deathT, 0, 1);
      const boil = Math.sin(t * 38 + ph) * 0.07 * (1 - d) * smooth(0, 0.12, d);
      const c = smooth(0.38, 0.98, d);
      sy = lerp(sy + boil, 0.05, c * c);
      const spread = lerp(1, 1.75, c);
      sx *= spread; sz *= spread;
      lean *= 1 - c; liftY = 0; lungeZ = 0;
      S.steamT -= dt;
      if (S.steamT <= 0 && d < 0.92) {
        S.steamT = 0.028 + d * 0.05;
        const r = S.emitR, a = r() * Math.PI * 2, rad = r() * G.dripR * (0.5 + c);
        emitSteam(Math.cos(a) * rad, 0.25 + r() * sy * 0.8, Math.sin(a) * rad, 2, t, 0.2, 6.5);
      }
      splash.visible = true;
      splash.scale.setScalar(G.dripR * lerp(1.2, 3.4, smooth(0.35, 0.95, d)));
      wet.scale.setScalar(G.dripR * lerp(1.7, 3.1, smooth(0.3, 1, d)));
      if (d >= 1) {
        S.dead = true;
        tilt.visible = false;
        if (healRing) healRing.visible = false;
        pts.points.visible = true; // last steam finishes on GPU; integrator removes group
      }
    }

    squashG.scale.set(sx, Math.max(0.04, sy), sz);
    tilt.rotation.x = lean;
    tilt.rotation.z = Math.sin(S.walkPhase) * 0.05 * spN + Math.sin(t * 0.9 + ph) * 0.012;
    tilt.position.set(0, liftY, lungeZ);

    solid.position.y = Math.sin(t * 0.8 + ph) * 0.012; // innards drift inside the shell
    if (cloud) {
      cloud.position.y = G.cloudY + Math.sin(t * 0.9 + ph) * 0.05;
      cloud.rotation.y += dt * 0.16;
    }
    if (healRing) {
      const period = state === 'attack' ? 1.5 : 3.4;
      S.healT += dt;
      const hp = (S.healT % period) / period;
      healRing.scale.setScalar(0.5 + hp * 2.8);
      healRing.material.opacity = (1 - hp) * (state === 'attack' ? 0.75 : 0.4);
    }

    // ----- shield fall -----
    if (shield && S.shieldFrac <= 0 && S.shieldFall < 1) {
      S.shieldFall = Math.min(1, S.shieldFall + dt / 0.55);
      const f = smooth(0, 1, S.shieldFall);
      shield.rotation.x = f * 1.42;
      shield.position.y = lerp(G.shieldPos[1], 0.14, f);
      shield.position.z = lerp(G.shieldPos[2], G.shieldPos[2] + 0.55, f);
    }

    // ----- splash disc (sea / attacks) -----
    if (!S.dying) {
      S.splash = Math.max(0, S.splash - dt * 1.3);
      const show = inSea || S.splash > 0.02;
      splash.visible = show;
      if (show) {
        const target = inSea ? G.dripR * (2.15 + Math.sin(t * 2.4 + ph) * 0.18)
                             : G.dripR * (1.3 + S.splash * 1.5);
        splash.scale.setScalar(target);
      }
    }

    // ----- hit flash -----
    if (S.flashT > 0) {
      S.flashT -= dt;
      const f = Math.max(0, S.flashT / 0.28);
      flash.scale.setScalar(0.02 + (1 - f) * 0.2 * f * 4 * 0.25 + f * 0.05);
      flash.visible = f > 0;
    }

    // ----- ambient drips + sun wisps -----
    if (!S.dying) {
      S.dripT -= dt * (inSea ? 2.2 : 1);
      if (S.dripT <= 0) {
        S.dripT = 0.1 + S.emitR() * 0.22;
        const r = S.emitR, a = r() * Math.PI * 2;
        emit(Math.cos(a) * G.dripR * (0.75 + r() * 0.3), G.dripY + r() * 0.25, Math.sin(a) * G.dripR * (0.75 + r() * 0.3),
          0, -0.15, 0, t, 0.45, 2 + r() * 1.4, 1, 0.82, 0.94, 1);
      }
      if (kind === 4 && w > 0.4) { // gusher vents steam while bloating
        S.steamT -= dt;
        if (S.steamT <= 0) { S.steamT = 0.06; emitSteam(G.ventPos[0], G.ventPos[1], G.ventPos[2], 1, t, 0.06, 3.4); }
      }
      if (inSun) {
        S.steamT -= dt * 0.4;
        if (S.steamT <= 0) { S.steamT = 0.5; emitSteam(0, G.bubbleC[1] + G.bubbleR[1], 0, 1, t, 0.3, 3); }
      }
    }

    if (pts.dirty) {
      pts.dirty = false;
      pts.geo.attributes.position.needsUpdate = true;
      pts.geo.attributes.aVel.needsUpdate = true;
      pts.geo.attributes.aInfo.needsUpdate = true;
      pts.geo.attributes.aCol.needsUpdate = true;
    }
  }

  function hit(worldPoint, strength = 1) {
    if (S.dying || S.dead || !worldPoint) return;
    _tmpV.copy(worldPoint);
    group.worldToLocal(_tmpV);
    _tmpV.y = Math.max(0.06, _tmpV.y);
    emitSteam(_tmpV.x, _tmpV.y, _tmpV.z, Math.round(clamp(5 + strength * 8, 3, 22)), uTime.value, 0.22, 5.5);
    flash.position.copy(_tmpV);
    S.flashT = 0.28;
    flash.visible = true;
    S.qv -= 2 + strength * 2.6;
    S.hurtT = Math.max(S.hurtT, 0.22);
    if (pts.dirty) {
      pts.geo.attributes.position.needsUpdate = true;
      pts.geo.attributes.aVel.needsUpdate = true;
      pts.geo.attributes.aInfo.needsUpdate = true;
      pts.geo.attributes.aCol.needsUpdate = true;
      pts.dirty = false;
    }
  }

  function startDeath() {
    if (!S.dying) {
      S.dying = true;
      S.deathT = 0;
      S.steamT = 0;
      emitSplashBurst(uTime.value, 16, 1.2);
      emitSteam(0, 0.7, 0, 10, uTime.value, 0.5, 7);
    }
    return DEATH_TIME;
  }

  function setShield(frac) {
    if (kind !== 6 || !shield) return;
    S.shieldFrac = clamp(frac, 0, 1);
    if (S.shieldFrac <= 0) return; // fall animation runs in update
    S.shieldFall = 0;
    shield.rotation.x = 0;
    shield.position.y = G.shieldPos[1];
    shield.position.z = G.shieldPos[2];
    shield.visible = true;
    const stage = S.shieldFrac > 0.66 ? 0 : S.shieldFrac > 0.33 ? 1 : 2;
    shieldPlate.material = coralMats[stage];
    shield.rotation.z = stage === 2 ? 0.09 : 0;
    if (shieldChunks) {
      shieldChunks[0].visible = stage < 2;
      shieldChunks[1].visible = stage < 1;
      shieldChunks[2].visible = stage < 2;
      shieldChunks[3].visible = stage < 1;
    }
  }

  function dispose() {
    group.removeFromParent();
    pts.geo.dispose();       // per-creature buffer only
    if (healRing) healRing.material.dispose();
    // geometries and materials are shared module-wide: never disposed here
  }

  return {
    group,
    radius: def.radius * scale,
    update, hit, startDeath, setShield, dispose,
  };
}





