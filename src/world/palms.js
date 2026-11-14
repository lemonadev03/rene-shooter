import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { scene } from "../core/state.js";
import { addSeg } from "../core/collision.js";
import { loadTexture, trackAssetTask } from "../core/assets.js";
import { V3 } from "../core/utils.js";

// Photoreal coconut palms: a curved, ringed trunk swept along a bent curve with
// scanned palm-bark PBR maps, a crown of bent alpha-tested frond cards, and a
// coconut cluster. Every palm on the beach is merged into three meshes (trunks,
// fronds, coconuts), so the whole grove costs three draw calls plus shadows.
// Per-tree variety comes from a seeded RNG, never Math.random, so the beach's
// other random placements keep their sequence.

const swayTime = { value: 0 };
export function updatePalms(t) {
  swayTime.value = t;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Gentle wind in the vertex shader: aSway is 0 at the frond base and 1 at the
// tip, aPhase separates fronds. The same patch runs on the depth material so
// frond shadows sway with the fronds and keep their cutout shape.
function addSway(material, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = swayTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSway;\nattribute float aPhase;\nuniform float uSwayTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  float swayW = aSway * aSway;
  float swayA = sin(uSwayTime * 1.35 + aPhase + aSway * 1.6) * 0.6
    + sin(uSwayTime * 2.2 + aPhase * 1.7 + aSway * 3.1) * 0.4;
  transformed.x += swayA * 0.055 * swayW;
  transformed.z += cos(uSwayTime * 1.05 + aPhase * 1.3) * 0.04 * swayW;
  transformed.y += sin(uSwayTime * 1.7 + aPhase + aSway * 2.3) * 0.03 * swayW;
}`,
      );
  };
  material.customProgramCacheKey = () => key;
}

function createPalmMaterials() {
  const trunk = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  trunk.color.setRGB(3.0, 2.8, 2.45);
  trunk.normalScale.set(1.1, 1.1);
  const frond = new THREE.MeshStandardMaterial({
    roughness: 0.82,
    side: THREE.DoubleSide,
    alphaTest: 0.42,
    vertexColors: true,
  });
  frond.color.setRGB(1.75, 1.85, 1.5);
  addSway(frond, "palm-frond-sway-1");
  const coconut = new THREE.MeshStandardMaterial({
    roughness: 0.72,
    vertexColors: true,
  });
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaTest: 0.42,
  });
  addSway(depth, "palm-frond-sway-depth-1");
  const url = (name) =>
    new URL(`../../assets/beach/${name}.webp`, import.meta.url).href;
  trackAssetTask(
    "palm-surfaces",
    (async () => {
      const [barkDiff, barkNormal, barkRough, frondMap] = await Promise.all([
        loadTexture(url("palm_bark_diff")),
        loadTexture(url("palm_bark_nor_gl"), {
          colorSpace: THREE.NoColorSpace,
        }),
        loadTexture(url("palm_bark_rough"), {
          colorSpace: THREE.NoColorSpace,
        }),
        loadTexture(url("palm_frond")),
      ]);
      for (const t of [barkDiff, barkNormal, barkRough]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
      }
      frondMap.anisotropy = 4;
      Object.assign(trunk, {
        map: barkDiff,
        normalMap: barkNormal,
        roughnessMap: barkRough,
      });
      trunk.needsUpdate = true;
      frond.map = frondMap;
      frond.emissiveMap = frondMap;
      frond.emissive.setRGB(0.1, 0.14, 0.05);
      frond.needsUpdate = true;
      depth.map = frondMap;
      depth.needsUpdate = true;
    })(),
  );
  return { trunk, frond, coconut, depth };
}

// Tapering tube along the trunk curve. The radius pulses every ~0.27 m for the
// ring scars coconut trunks carry, flares at the base, and the UVs tile the
// bark roughly every 1.1 m of trunk and twice around it.
function trunkGeometry(curve) {
  const tubular = 26,
    radial = 9;
  const frames = curve.computeFrenetFrames(tubular, false);
  const length = curve.getLength();
  const positions = [],
    uvs = [],
    indices = [];
  const point = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, point);
    const ring = 1 + 0.07 * Math.sin(t * length * ((Math.PI * 2) / 0.27));
    const flare = 1 + 0.55 * Math.exp(-t * 16);
    const radius =
      THREE.MathUtils.lerp(0.3, 0.145, Math.pow(t, 0.85)) * ring * flare;
    const normal = frames.normals[i],
      binormal = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sin = Math.sin(a),
        cos = -Math.cos(a);
      const nx = cos * normal.x + sin * binormal.x;
      const ny = cos * normal.y + sin * binormal.y;
      const nz = cos * normal.z + sin * binormal.z;
      positions.push(
        point.x + radius * nx,
        point.y + radius * ny,
        point.z + radius * nz,
      );
      uvs.push((j / radial) * 2, t * (length / 1.1));
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = (radial + 1) * i + j;
      const b = (radial + 1) * (i + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// One frond card: a plane whose length runs along +Y from its base, bent into
// a drooping arc with a V fold across the rachis and a slight twist, so the
// photographed leaflets catch light like a real frond instead of a flat card.
// The card is cropped to the frond texture's measured alpha envelope per row
// (geometry and UVs scale together, so the leaf looks identical). The GTAO
// G-buffer ignores alphaTest, so an uncropped card would darken the sky
// around the crown as one solid quad at high and ultra tiers.
const FROND_ENVELOPE = [
  0.85, 1, 0.97, 0.89, 0.77, 0.72, 0.71, 0.69, 0.69, 0.45, 0.22,
];
function frondGeometry(len, droop, twist) {
  const geometry = new THREE.PlaneGeometry(len * 0.612, len, 4, 10);
  geometry.translate(0, len / 2, 0);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const sway = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    const t = y / len;
    const envelope = FROND_ENVELOPE[Math.round(t * 10)];
    const x = pos.getX(v) * envelope;
    uv.setX(v, 0.5 + (uv.getX(v) - 0.5) * envelope);
    let nx = x;
    let nz = droop * t * t * len * 0.52 + Math.abs(x) * 0.5;
    const ny = y * (1 - 0.16 * droop * t * t);
    const tw = twist * t;
    const rx = nx * Math.cos(tw) - nz * Math.sin(tw);
    nz = nx * Math.sin(tw) + nz * Math.cos(tw);
    nx = rx;
    pos.setXYZ(v, nx, ny, nz);
    sway[v] = t;
  }
  geometry.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function fillAttribute(geometry, name, value, itemSize = 1) {
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++)
    for (let k = 0; k < itemSize; k++)
      data[i * itemSize + k] = Array.isArray(value) ? value[k] : value;
  geometry.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export function createPalmBatch() {
  const materials = createPalmMaterials();
  const trunks = [],
    fronds = [],
    coconuts = [];
  let index = 0;

  function add(x, z, lean, s, yaw) {
    const rng = seeded(9137 + index * 7919);
    index++;
    const range = (a, b) => a + rng() * (b - a);
    const curve = new THREE.CatmullRomCurve3([
      V3(0, -0.18, 0),
      V3(lean * 1.0, 2.0, 0),
      V3(lean * 2.2, 3.9, 0),
      V3(lean * 3.1, 5.3, 0),
    ]);
    const matrix = new THREE.Matrix4().compose(
      V3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw),
      V3(s, s, s),
    );
    trunks.push(trunkGeometry(curve).applyMatrix4(matrix));
    const top = curve.getPoint(1);

    // Crown: three green tiers (steep young fronds over flat mature ones)
    // plus two dead fronds hanging under the crown, tinted dry brown.
    const tiers = [
      { n: 4, pitch: 0.92, len: 2.7, droop: 0.35, tint: [1.15, 1.3, 0.8] },
      { n: 6, pitch: 0.45, len: 3.5, droop: 0.65, tint: [1.05, 1.25, 0.72] },
      { n: 4, pitch: 0.02, len: 3.8, droop: 0.95, tint: [0.95, 1.15, 0.65] },
      { n: 2, pitch: -0.72, len: 2.7, droop: 1.0, tint: [1.0, 0.72, 0.38] },
    ];
    for (const tier of tiers) {
      const offset = rng() * Math.PI * 2;
      for (let i = 0; i < tier.n; i++) {
        const yawn = offset + (i / tier.n) * Math.PI * 2 + range(-0.18, 0.18);
        const pitch = tier.pitch + range(-0.2, 0.2);
        const frond = frondGeometry(
          tier.len * range(0.8, 1.22),
          tier.droop * range(0.78, 1.32),
          range(-0.35, 0.35),
        );
        const shade = range(0.85, 1.12);
        fillAttribute(
          frond,
          "color",
          tier.tint.map((c) => c * shade),
          3,
        );
        fillAttribute(frond, "aPhase", rng() * Math.PI * 2);
        _q.setFromAxisAngle(V3(0, 1, 0), yawn);
        _q2.setFromAxisAngle(V3(1, 0, 0), Math.PI / 2 - pitch);
        _q.multiply(_q2);
        _q2.setFromAxisAngle(V3(0, 1, 0), range(-0.75, 0.75));
        _q.multiply(_q2);
        _m.compose(top, _q, V3(1, 1, 1));
        frond.applyMatrix4(_m).applyMatrix4(matrix);
        const normals = frond.attributes.normal;
        for (let v = 0; v < normals.count; v++) {
          const nx = normals.getX(v) * 0.35;
          const ny = normals.getY(v) * 0.35 + 0.65;
          const nz = normals.getZ(v) * 0.35;
          const il = 1 / Math.hypot(nx, ny, nz);
          normals.setXYZ(v, nx * il, ny * il, nz * il);
        }
        fronds.push(frond);
      }
    }

    // Coconut cluster tucked under the crown, green ripening to brown.
    const nuts = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < nuts; i++) {
      const a = (i / nuts) * Math.PI * 2 + rng() * 0.7;
      const r = range(0.15, 0.21);
      const nut = new THREE.SphereGeometry(r, 10, 8);
      nut.scale(1, 1.14, 1);
      nut.translate(
        top.x + Math.cos(a) * range(0.12, 0.3),
        top.y - range(0.24, 0.44),
        top.z + Math.sin(a) * range(0.12, 0.3),
      );
      const ripe = rng();
      fillAttribute(
        nut,
        "color",
        [
          THREE.MathUtils.lerp(0.1, 0.17, ripe),
          THREE.MathUtils.lerp(0.17, 0.09, ripe),
          THREE.MathUtils.lerp(0.035, 0.025, ripe),
        ],
        3,
      );
      nut.applyMatrix4(matrix);
      coconuts.push(nut);
    }

    // Trunk colliders follow the lean exactly as the old palms: the two lower
    // capsules block walkers, the two upper ones only stop shots.
    const at = (h) => {
      let best = null,
        bd = 1e9;
      for (let i = 0; i <= 60; i++) {
        const p = curve.getPoint(i / 60),
          dd = Math.abs(p.y - h);
        if (dd < bd) {
          bd = dd;
          best = p;
        }
      }
      return best.clone().applyMatrix4(matrix);
    };
    const hs = [0, 1.3, 2.6, 3.9, 5.2],
      tp = hs.map(at);
    for (let i = 0; i < 4; i++)
      addSeg(
        tp[i].x,
        tp[i].z,
        tp[i + 1].x,
        tp[i + 1].z,
        0.27 * s,
        hs[i + 1] * s,
        hs[i] * s,
        i >= 2,
      );
  }

  function build() {
    const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), materials.trunk);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    const frondMesh = new THREE.Mesh(mergeGeometries(fronds), materials.frond);
    frondMesh.castShadow = true;
    frondMesh.receiveShadow = true;
    frondMesh.customDepthMaterial = materials.depth;
    frondMesh.userData.excludeFromAO = true;
    const coconutMesh = new THREE.Mesh(
      mergeGeometries(coconuts),
      materials.coconut,
    );
    coconutMesh.castShadow = true;
    for (const mesh of [trunkMesh, frondMesh, coconutMesh]) {
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
  }

  return { add, build };
}
