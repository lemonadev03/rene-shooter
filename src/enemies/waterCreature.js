// Living seawater; +Z faces forward, feet at y=0. Shared load-time sculptures,
// one physical transmission material/pass, one instanced spray draw per animal.
// update() changes transforms/morph weights only; event buffers are preallocated.
import * as THREE from "three";

export const CREATURES = [
  { name: "DROPLET", s: 1, radius: 0.58 },
  { name: "TIDE BRUTE", s: 1.7, radius: 0.62 },
  { name: "JETTER", s: 1.15, radius: 0.56 },
  { name: "SURFER", s: 0.92, radius: 0.62 },
  { name: "GUSHER", s: 1.12, radius: 0.62 },
  { name: "PUDDLER", s: 1.3, radius: 0.78 },
  { name: "CORAL WARDEN", s: 1.25, radius: 0.62 },
  { name: "RAIN SHAMAN", s: 1.05, radius: 0.55 },
];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const v = clamp((x - a) / (b - a));
  return v * v * (3 - 2 * v);
};
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
const time = { value: 0 };
const noiseGLSL = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
// Repeatable rippled normal map, sampled twice with opposing, advected UVs.
const normalData = new Uint8Array(128 * 128 * 4);
for (let y = 0; y < 128; y++)
  for (let x = 0; x < 128; x++) {
    const a = (x / 128) * Math.PI * 2,
      b = (y / 128) * Math.PI * 2,
      i = (y * 128 + x) * 4;
    const dx =
      Math.cos(a * 7 + Math.sin(b * 3)) * 0.22 +
      Math.cos(a * 13 - b * 5) * 0.12;
    const dy =
      Math.cos(b * 9 + Math.sin(a * 4)) * 0.22 -
      Math.cos(a * 13 - b * 5) * 0.08;
    normalData[i] = 128 + dx * 100;
    normalData[i + 1] = 128 + dy * 100;
    normalData[i + 2] =
      128 +
      (Math.sin(a * 7 + Math.sin(b * 3)) * 0.45 +
        Math.sin(b * 9 + Math.sin(a * 4)) * 0.35 +
        Math.sin(a * 13 - b * 5) * 0.2) *
        75;
    normalData[i + 3] = 255;
  }
const ripple = new THREE.DataTexture(normalData, 128, 128);
ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
ripple.magFilter = THREE.LinearFilter;
ripple.minFilter = THREE.LinearMipmapLinearFilter;
ripple.generateMipmaps = true;
ripple.needsUpdate = true;
const water = new THREE.MeshPhysicalMaterial({
  color: 0xf3fff9,
  roughness: 0.055,
  metalness: 0,
  transmission: 1,
  ior: 1.33,
  thickness: 0.82,
  attenuationColor: new THREE.Color(0x91d4c3),
  attenuationDistance: 2.4,
  envMapIntensity: 1.5,
  specularIntensity: 1,
});
water.onBeforeCompile = (shader) => {
  shader.uniforms.wcTime = time;
  shader.uniforms.wcRipple = { value: ripple };
  const vary = `uniform float wcTime; attribute vec3 aWater; attribute vec4 aBoil; varying vec3 vFlow; varying vec3 vWater;`;
  shader.vertexShader = vary + "\n" + shader.vertexShader;
  // Deform after morphing: the wind-up remains a single continuous sculpture.
  shader.vertexShader = shader.vertexShader.replace(
    "#include <displacementmap_vertex>",
    `
#include <displacementmap_vertex>
vFlow=transformed;vWater=aWater;
float phase=dot(modelMatrix[3].xz,vec2(1.17,2.31));
float wave=sin(position.y*19.+wcTime*3.8+position.z*11.+phase)*sin(position.x*17.+wcTime*1.6);
float swell=sin(position.z*12.+position.y*9.+wcTime*2.7+phase);
transformed+=objectNormal*(wave*.012+swell*.012)*smoothstep(.015,.22,position.y);
float boilAge=wcTime-aBoil.w;
transformed+=aBoil.xyz*sin(boilAge*36.)*max(0.,1.-boilAge*2.);
`,
  );
  shader.fragmentShader =
    `uniform float wcTime;uniform sampler2D wcRipple;varying vec3 vFlow;varying vec3 vWater;${noiseGLSL}` +
    shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <color_fragment>",
      `
#include <color_fragment>
vec3 flowP=vFlow*13.+vec3(wcTime*.22,wcTime*1.35,-wcTime*.4);
float churn=noise3(flowP),fine=texture2D(wcRipple,vFlow.xy*5.+wcTime*.03).x;
float foam=smoothstep(.28,.66,vWater.x)*smoothstep(.45,.76,churn+fine*.16);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.97,.96),foam);
`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `
#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.72,foam);
`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `
#include <normal_fragment_maps>
vec2 uv1=vFlow.xz*1.8+vec2(wcTime*.027,wcTime*.049)+vFlow.y*.37;
vec2 uv2=vFlow.zy*2.7+vec2(-wcTime*.034,wcTime*.067);
vec4 rip1=texture2D(wcRipple,uv1),rip2=texture2D(wcRipple,uv2);
float waterHeight=(rip1.b+rip2.b)*.028*(1.-foam*.65);
vec3 surfX=dFdx(-vViewPosition),surfY=dFdy(-vViewPosition);
vec3 rX=cross(surfY,normal),rY=cross(normal,surfX);
float det=dot(surfX,rX);
normal=normalize(abs(det)*normal-sign(det)*(dFdx(waterHeight)*rX+dFdy(waterHeight)*rY));
`,
    )
    .replace(
      "#include <transmission_fragment>",
      `
#ifdef USE_TRANSMISSION
material.transmission=transmission*(1.-foam*.98);
material.transmissionAlpha=1.;
// Vertex radius supplies optical path length: thin fins stay clear, thick wave absorbs teal.
material.thickness=thickness*max(.035,vWater.y);
material.attenuationDistance=attenuationDistance;
material.attenuationColor=attenuationColor;
vec3 pos=vWorldPosition;
vec3 v=normalize(cameraPosition-pos);
vec3 n=transformNormalByInverseViewMatrix(normal,viewMatrix);
vec4 transmitted=getIBLVolumeRefraction(n,v,material.roughness,material.diffuseContribution,material.specularColorBlended,material.specularF90,pos,modelMatrix,viewMatrix,projectionMatrix,material.dispersion,material.ior,material.thickness,material.attenuationColor,material.attenuationDistance);
material.transmissionAlpha=mix(1.,transmitted.a,material.transmission);
totalDiffuse=mix(totalDiffuse,transmitted.rgb,material.transmission);
// Small volume-scattering term from aerated seawater, in addition to absorption.
totalDiffuse+=vec3(.012,.065,.052)*(1.-exp(-material.thickness*.8))*(1.-foam);
#endif
`,
    );
};
water.customProgramCacheKey = () => "sculpted-surf-2";

// All sculpting occurs once per kind. Sweeps have varying radii, flattened blades,
// corrugated surfaces and Catmull-Rom spines; no cylinders or separate inner cores.
const cache = [];
function sculpture(kind) {
  if (cache[kind]) return cache[kind];
  const vertices = [],
    indices = [],
    waterAttr = [],
    wind = [];
  const foamSeeds = [],
    feet = [];
  const tmp = new THREE.Vector3(),
    tan = new THREE.Vector3(),
    side = new THREE.Vector3(),
    up = new THREE.Vector3();
  function point(x, y, z, foam, thick) {
    const i = vertices.length / 3;
    const turbulence =
      (Math.sin(x * 23 + y * 13 + z * 17) +
        Math.sin(z * 31 - y * 19 + x * 11)) *
      0.008;
    y = Math.max(0.012, y + turbulence * smooth(0.03, 0.3, y));
    vertices.push(x, y, z);
    waterAttr.push(foam, thick, kind);
    let wx = x,
      wy = y,
      wz = z;
    if (kind === 1) {
      const f = smooth(0.5, 1.8, y);
      wy += f * 0.55;
      wz -= f * 0.42;
      wx *= 1 + f * 0.08;
    }
    if (kind === 2) {
      const f = smooth(0.32, 0.95, z) * smooth(0.85, 1.35, y);
      wx *= 1 + f * 0.9;
      wy = 1.22 + (y - 1.22) * (1 + f * 0.38);
      wz += f * 0.12;
    }
    if (kind === 3) {
      const f = smooth(0.25, 1.5, y);
      wy += f * 0.12;
      wz = wz * (1 - f * 0.24) - f * 0.23;
    }
    if (kind === 4) {
      const f = smooth(0.12, 0.5, y);
      wx *= 1 + f * 0.34;
      wz *= 1 + f * 0.34;
      wy = 0.25 + (y - 0.25) * (1 + f * 0.28);
    }
    if (kind === 5) {
      wy += Math.max(0, y - 0.08) * 0.5;
    }
    if (kind === 7) {
      wx *= 1 + smooth(0.6, 1.8, y) * 0.18;
    }
    wind.push(wx - x, wy - y, wz - z);
    return i;
  }
  function quad(a, b, c, d) {
    indices.push(a, b, d, b, c, d);
  }
  function sweep(
    points,
    radii,
    {
      steps = 26,
      sides = 10,
      flat = 1,
      foam = 0.12,
      crest = false,
      blades = 0,
    } = {},
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    const base = vertices.length / 3,
      frames = curve.computeFrenetFrames(steps, false);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        ri = t * (radii.length - 1),
        k = Math.min(radii.length - 2, Math.floor(ri)),
        r = THREE.MathUtils.lerp(radii[k], radii[k + 1], ri - k);
      curve.getPoint(t, tmp);
      curve.getTangent(t, tan).normalize();
      side.copy(frames.normals[i]);
      up.copy(frames.binormals[i]);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2,
          cs = Math.cos(a),
          sn = Math.sin(a);
        const fold =
          1 +
          Math.sin(t * 43 + a * 5) * 0.075 +
          Math.sin(t * 79 - a * 3) * 0.035;
        const fin =
          1 +
          blades *
            Math.pow(Math.max(0, sn), 8) *
            (0.5 + 0.5 * Math.sin(t * 17));
        const x = tmp.x + r * fold * (side.x * cs + up.x * sn * flat * fin),
          y = tmp.y + r * fold * (side.y * cs + up.y * sn * flat * fin),
          z = tmp.z + r * fold * (side.z * cs + up.z * sn * flat * fin);
        const f = clamp(
          foam +
            (crest ? Math.max(0, side.y * cs + up.y * sn) * 0.65 : 0) +
            smooth(0.15, 0.025, y) * 0.6,
        );
        point(x, y, z, f, Math.max(0.045, r * 2));
        if (i < steps && j < sides) {
          const v = base + i * (sides + 1) + j;
          quad(v, v + 1, v + sides + 2, v + sides + 1);
        }
      }
      if (crest && i % 2 === 0)
        foamSeeds.push([tmp.x, tmp.y + r * flat, tmp.z, r * 0.4]);
    }
    // Close tiny ends, avoiding open tube silhouettes.
    for (const end of [0, steps]) {
      const b = base + end * (sides + 1);
      for (let j = 1; j < sides - 1; j++)
        end
          ? indices.push(b, b + j, b + j + 1)
          : indices.push(b, b + j + 1, b + j);
    }
  }
  function mass(
    cx,
    cy,
    cz,
    rx,
    ry,
    rz,
    { foam = 0.1, lobes = 0.035, segments = 32, rings = 22 } = {},
  ) {
    const b = vertices.length / 3;
    for (let i = 0; i <= rings; i++)
      for (let j = 0; j <= segments; j++) {
        const v = (i / rings) * Math.PI,
          u = (j / segments) * Math.PI * 2,
          s = Math.sin(v);
        const d =
          1 +
          lobes *
            (Math.sin(u * 7 + v * 9) + Math.sin(u * 11 - v * 7) * 0.5) *
            s;
        const x = cx + Math.cos(u) * s * rx * d,
          y = cy + Math.cos(v) * ry * d,
          z = cz + Math.sin(u) * s * rz * d;
        point(
          x,
          y,
          z,
          foam + smooth(cy + ry * 0.4, cy + ry, y) * 0.35,
          Math.max(0.05, 2 * rx * s),
        );
        if (i < rings && j < segments) {
          const a = b + i * (segments + 1) + j;
          quad(a, a + 1, a + segments + 2, a + segments + 1);
        }
      }
  }
  function leg(sd, z, spread, height = 0.8) {
    const f = [sd * spread, 0.02, z * 1.8];
    feet.push(f);
    sweep(
      [
        [sd * 0.29, height, z * 0.5],
        [sd * (spread * 0.7), height * 0.67, z * 1.1],
        [sd * (spread * 0.85), height * 0.3, z * 1.5],
        f,
      ],
      [0.15, 0.105, 0.055, 0.008],
      { steps: 18, sides: 8, flat: 0.7, foam: 0.08, blades: 0.6 },
    );
  }
  function wave(width, height, depth) {
    // A closed, curling breaking-wave sheet: broad at the toe, thin at the lip.
    const b = vertices.length / 3,
      N = 34,
      M = 18;
    for (let face = 0; face < 2; face++)
      for (let i = 0; i <= N; i++)
        for (let j = 0; j <= M; j++) {
          const u = i / N,
            v = (j / M) * 2 - 1,
            a = u * Math.PI * 1.48;
          const y = 0.035 + height * (1 - Math.cos(a)) * 0.53;
          const z = -depth * 0.48 + Math.sin(a) * depth * 0.7 + u * 0.18;
          const w =
            width * (1 - u * 0.22) * (1 + 0.07 * Math.sin(u * 27 + v * 5));
          const thick = (0.15 * (1 - u) + 0.017) * (face ? 1 : -1);
          point(
            v * w,
            Math.max(0.013, y + thick * Math.cos(a)),
            z - thick * Math.sin(a),
            smooth(0.56, 0.95, u) * 0.88 + smooth(0.16, 0, u) * 0.5,
            0.25 * (1 - u) + 0.035,
          );
          if (i < N && j < M) {
            const k = b + face * (N + 1) * (M + 1) + i * (M + 1) + j;
            if (face) quad(k, k + M + 1, k + M + 2, k + 1);
            else quad(k, k + 1, k + M + 2, k + M + 1);
          }
          if (face === 0 && i > N * 0.75 && i % 4 === 0 && j % 3 === 0)
            foamSeeds.push([v * w, y + 0.025, z, 0.04]);
        }
    const off = (N + 1) * (M + 1);
    for (let i = 0; i < N; i++)
      for (const j of [0, M]) {
        const k = b + i * (M + 1) + j;
        quad(k, k + M + 1, k + M + 1 + off, k + off);
      }
    for (let j = 0; j < M; j++)
      for (const i of [0, N]) {
        const k = b + i * (M + 1) + j;
        quad(k, k + off, k + off + 1, k + 1);
      }
  }
  if (kind === 0) {
    mass(0, 0.6, -0.05, 0.34, 0.24, 0.6, { lobes: 0.065 });
    sweep(
      [
        [0, 0.63, -0.35],
        [0, 0.68, 0.13],
        [0, 0.59, 0.69],
        [0, 0.51, 0.91],
      ],
      [0.27, 0.25, 0.12, 0.005],
      { flat: 0.65, blades: 1.3 },
    );
    for (const sd of [-1, 1]) {
      leg(sd, 0.34, 0.78, 0.56);
      leg(sd, -0.3, 0.66, 0.56);
      sweep(
        [
          [sd * 0.15, 0.71, 0.25],
          [sd * 0.35, 0.83, -0.2],
          [sd * 0.47, 0.77, -0.65],
          [sd * 0.38, 0.87, -0.92],
        ],
        [0.08, 0.12, 0.05, 0.002],
        { flat: 0.22, blades: 1.2, foam: 0.3 },
      );
    }
  } else if (kind === 1) {
    sweep(
      [
        [-0.94, 0.02, 0.12],
        [-0.99, 0.62, 0.04],
        [-0.66, 1.4, -0.12],
        [-0.15, 1.7, -0.2],
        [0.42, 1.63, -0.08],
        [0.86, 1.1, 0.1],
        [1.03, 0.02, 0.22],
      ],
      [0.28, 0.39, 0.44, 0.48, 0.43, 0.34, 0.3],
      { steps: 50, sides: 18, flat: 1.15, crest: true, blades: 0.7 },
    );
    for (const sd of [-1, 1]) {
      sweep(
        [
          [sd * 0.47, 1.22, -0.3],
          [sd * 0.71, 0.66, -0.55],
          [sd * 0.8, 0.03, -0.64],
        ],
        [0.29, 0.23, 0.18],
        { crest: true },
      );
      feet.push([sd * 1, 0.02, 0.2], [sd * 0.8, 0.02, -0.64]);
    }
    for (const sd of [-1, 1])
      for (let f = 0; f < 3; f++) {
        sweep(
          [
            [sd * 0.64, 0.16, 0.12],
            [sd * (1.04 + f * 0.08), 0.14, 0.35 + f * 0.14],
            [sd * (1.23 + f * 0.08), 0.025, 0.5 + f * 0.16],
          ],
          [0.12, 0.055, 0.002],
          { steps: 15, sides: 8, flat: 0.33, crest: true, foam: 0.4 },
        );
        sweep(
          [
            [sd * 0.28, 1.83, -0.2],
            [sd * (0.4 + f * 0.12), 2.03 + f * 0.07, -0.35 - f * 0.07],
            [sd * (0.58 + f * 0.13), 1.96 + f * 0.1, -0.55 - f * 0.12],
          ],
          [0.09, 0.05, 0.002],
          { steps: 18, sides: 8, flat: 0.28, crest: true, foam: 0.45 },
        );
      }
    sweep(
      [
        [-0.12, 1.76, -0.1],
        [0.06, 1.79, 0.3],
        [0.13, 1.56, 0.74],
        [0.11, 1.42, 0.91],
      ],
      [0.35, 0.4, 0.25, 0.008],
      { flat: 0.75, crest: true, blades: 1.3 },
    );
    sweep(
      [
        [-0.8, 1.47, -0.24],
        [-0.38, 1.96, -0.3],
        [0.13, 2.03, -0.2],
        [0.62, 1.76, 0.02],
      ],
      [0.08, 0.21, 0.18, 0.025],
      { flat: 0.62, crest: true, foam: 0.45, blades: 1.8 },
    );
  } else if (kind === 2) {
    mass(0, 1.1, -0.08, 0.44, 0.48, 0.43, { lobes: 0.024 });
    for (const sd of [-1, 1]) {
      leg(sd, 0.36, 0.77, 1.02);
      leg(sd, -0.36, 0.68, 1.1);
    }
    sweep(
      [
        [0, 1.19, 0.13],
        [0, 1.42, 0.47],
        [0, 1.62, 0.94],
        [0, 1.69, 1.3],
      ],
      [0.3, 0.2, 0.095, 0.035],
      { flat: 0.85, blades: 0.5, foam: 0.12 },
    );
    for (const sd of [-1, 1])
      sweep(
        [
          [sd * 0.28, 1.35, -0.05],
          [sd * 0.49, 1.52, -0.45],
          [sd * 0.62, 1.39, -0.65],
        ],
        [0.1, 0.045, 0.002],
        { flat: 0.25, foam: 0.22 },
      );
    foamSeeds.push([0, 1.7, 1.33, 0.025]);
  } else if (kind === 3) {
    mass(0, 0.12, -0.18, 0.67, 0.15, 0.8, {
      foam: 0.32,
      lobes: 0.1,
      segments: 26,
      rings: 14,
    });
    wave(0.64, 1.12, 1.12);
    sweep(
      [
        [0, 1.03, -0.14],
        [0, 1.54, -0.02],
        [0, 1.62, 0.56],
        [0, 1.37, 1.03],
      ],
      [0.23, 0.2, 0.14, 0.003],
      { steps: 34, sides: 12, flat: 0.85, blades: 1.5, foam: 0.1 },
    );
    sweep(
      [
        [0, 1.46, 0.12],
        [0, 1.12, -0.53],
        [0, 1.24, -1.04],
        [0, 1.65, -1.32],
        [0, 1.78, -1.02],
      ],
      [0.2, 0.16, 0.1, 0.045, 0.002],
      { steps: 34, sides: 12, flat: 0.7, blades: 1.8, foam: 0.1 },
    );
    feet.push([-0.5, 0.02, 0.3], [0.5, 0.02, 0.3]);
  } else if (kind === 4) {
    mass(0, 0.77, 0, 0.65, 0.67, 0.62, {
      lobes: 0.035,
      segments: 36,
      rings: 24,
    });
    for (const sd of [-1, 1])
      for (const z of [-0.25, 0.27]) leg(sd, z, 0.64, 0.38);
    sweep(
      [
        [0, 1.25, 0],
        [0.07, 1.48, -0.04],
        [0.02, 1.56, 0.03],
      ],
      [0.19, 0.11, 0.035],
      { flat: 0.7, crest: true, foam: 0.5 },
    );
  } else if (kind === 5) {
    mass(0, 0.17, 0, 0.97, 0.15, 0.7, { lobes: 0.13 });
    for (const sd of [-1, 1])
      mass(sd * 0.4, 0.26, -0.06, 0.35, 0.26, 0.4, {
        lobes: 0.08,
        segments: 28,
        rings: 18,
      });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2,
        x = Math.cos(a),
        z = Math.sin(a);
      sweep(
        [
          [x * 0.55, 0.13, z * 0.45],
          [x * 0.99, 0.14, z * 0.83],
          [x * 1.17 + z * 0.18, 0.34, z * 0.99 - x * 0.18],
          [x * 1.32, 0.37, z * 1.18],
        ],
        [0.16, 0.1, 0.045, 0.002],
        { flat: 0.45, blades: 0.8, foam: 0.27 },
      );
      feet.push([x * 0.9, 0.02, z * 0.7]);
    }
  } else if (kind === 6) {
    mass(0, 0.85, -0.1, 0.67, 0.35, 0.44, { lobes: 0.065 });
    for (const sd of [-1, 1]) {
      for (const z of [-0.32, 0, 0.32]) leg(sd, z, 0.99, 0.75);
      sweep(
        [
          [sd * 0.5, 0.74, 0.22],
          [sd * 0.93, 0.51, 0.49],
          [sd * 1.1, 0.67, 0.83],
          [sd * 0.82, 0.91, 0.97],
        ],
        [0.23, 0.22, 0.18, 0.065],
        { flat: 0.75, crest: true },
      );
      sweep(
        [
          [sd * 1.08, 0.68, 0.83],
          [sd * 1.18, 0.94, 1.06],
          [sd * 0.96, 1.12, 1.09],
        ],
        [0.14, 0.12, 0.003],
        { flat: 0.7, blades: 0.8 },
      );
      sweep(
        [
          [sd * 0.87, 0.85, 0.93],
          [sd * 0.66, 1.02, 1.04],
          [sd * 0.7, 1.13, 1.1],
        ],
        [0.12, 0.07, 0.003],
        { flat: 0.75 },
      );
    }
  } else {
    sweep(
      [
        [0, 0.02, 0],
        [-0.17, 0.36, 0.05],
        [0.13, 0.79, -0.06],
        [-0.08, 1.22, 0],
        [0.12, 1.67, 0],
        [0.02, 1.86, 0],
      ],
      [0.34, 0.17, 0.2, 0.23, 0.13, 0.003],
      { steps: 44, sides: 14, flat: 0.8, blades: 1.5, foam: 0.12 },
    );
    for (const sd of [-1, 1]) {
      sweep(
        [
          [0, 1.07, 0],
          [sd * 0.5, 1.26, 0.06],
          [sd * 0.93, 1.49, 0],
          [sd * 1.12, 1.8, -0.03],
        ],
        [0.19, 0.13, 0.055, 0.002],
        { flat: 0.58, blades: 1.3 },
      );
      for (let f = 0; f < 3; f++)
        sweep(
          [
            [sd * 0.55, 1.31, 0.03],
            [sd * (0.82 + f * 0.12), 1.38 + f * 0.16, (f - 1) * 0.2],
            [sd * (1 + f * 0.15), 1.7 + f * 0.08, (f - 1) * 0.24],
          ],
          [0.075, 0.035, 0.002],
          { steps: 21, sides: 8, flat: 0.5, foam: 0.15 },
        );
      sweep(
        [
          [sd * 0.14, 0.72, 0],
          [sd * 0.7, 1.13, -0.08],
          [sd * 1.05, 1.36, -0.23],
        ],
        [0.08, 0.045, 0.002],
        { flat: 0.5 },
      );
      feet.push([sd * 0.24, 0.02, 0]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("aWater", new THREE.Float32BufferAttribute(waterAttr, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // Dihedral normal changes identify folded surf; height/orientation marks crests.
  const normals = geo.attributes.normal,
    foamAttribute = geo.attributes.aWater;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i],
      b = indices[i + 1],
      c = indices[i + 2];
    const dot = (u, v) =>
      normals.getX(u) * normals.getX(v) +
      normals.getY(u) * normals.getY(v) +
      normals.getZ(u) * normals.getZ(v);
    const bend =
      smooth(0.025, 0.18, 1 - Math.min(dot(a, b), dot(b, c), dot(c, a))) * 0.2;
    for (const v of [a, b, c])
      if (vertices[v * 3 + 1] > 0.08 && normals.getY(v) > -0.15) {
        waterAttr[v * 3] = Math.max(waterAttr[v * 3], bend + 0.15);
        foamAttribute.setX(v, waterAttr[v * 3]);
      }
  }
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(wind, 3)];
  geo.morphTargetsRelative = true;
  geo.computeBoundingSphere();
  // Foam flecks are sampled from the actual folded surface, never discs on sand.
  const rand = rng(250 + kind);
  for (let i = 0; i < vertices.length / 3; i += 5)
    if (waterAttr[i * 3] > 0.52 && rand() > 0.55)
      foamSeeds.push([
        vertices[i * 3],
        vertices[i * 3 + 1],
        vertices[i * 3 + 2],
        0.014 + rand() * 0.027,
      ]);
  return (cache[kind] = {
    geo,
    foamSeeds,
    feet,
    height:
      kind === 7
        ? 2.65
        : kind === 1
          ? 2.2
          : kind === 2 || kind === 3
            ? 1.8
            : kind === 5
              ? 0.55
              : 1.5,
  });
}

const wetMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv;${noiseGLSL}void main(){vec2 p=vUv*2.-1.;float d=length(p);float n=noise3(vec3(p*8.,0.));float a=(1.-smoothstep(.6,1.,d+n*.13))*.28;gl_FragColor=vec4(.12,.16,.12,a);}`,
});
const disc = new THREE.CircleGeometry(1, 48);
const sprayMaterial = new THREE.ShaderMaterial({
  uniforms: { wcTime: time },
  transparent: true,
  depthWrite: false,
  vertexShader: `uniform float wcTime;attribute vec3 aOrigin;attribute vec3 aVelocity;attribute vec4 aData;attribute float aSeed;varying vec2 vUv;varying float vAlpha;varying float vKind;varying float vSeed;
void main(){float mode=aData.w;float age=wcTime-aData.x;float life=aData.y;bool loop=mode<3.;if(loop)age=mod(max(age,0.),life);float n=age/life;
vec3 p=aOrigin;float alpha=step(0.,age)*(1.-step(1.,n));float size=aData.z;
if(mode<-.5){p+=vec3(sin(wcTime*2.+aSeed)*.008,cos(wcTime*3.+aSeed)*.006,0.);alpha=.8;}
else if(mode<.5){p+=aVelocity*age+vec3(0.,-1.7,0.)*age*age;alpha*=sin(n*3.14159);}
else if(mode<2.5){p+=aVelocity*age+vec3(0.,mode>1.5?0.:-2.8,0.)*age*age;alpha*=1.-smoothstep(.7,1.,n);}
else if(mode<3.5){p+=aVelocity*age+vec3(sin(age*3.+aSeed)*.12,.22*age*age,0.);size*=1.+n*3.;alpha*=smoothstep(0.,.12,n)*(1.-smoothstep(.45,1.,n))*.48;}
else {p+=aVelocity*age+vec3(0.,-2.8,0.)*age*age;alpha*=sin(n*3.14159);}
vec4 mv=modelViewMatrix*vec4(p,1.);vec2 q=position.xy*size;
if(mode>1.5&&mode<2.5)q.y*=6.;else if(mode>.5&&mode<1.5)q.y*=2.7;
mv.xy+=q;gl_Position=projectionMatrix*mv;vUv=uv;vAlpha=alpha;vKind=mode;vSeed=aSeed;
}`,
  fragmentShader: `varying vec2 vUv;varying float vAlpha;varying float vKind;varying float vSeed;
void main(){vec2 p=(vUv-.5)*2.;float d=dot(p,p);float a=exp(-d*3.5)*(1.-smoothstep(.4,1.,d))*vAlpha;
float grain=fract(sin(dot(floor(vUv*14.),vec2(12.98,78.23))+vSeed)*43758.5);a*=mix(.7,1.,grain);
vec3 c=vKind<-.5?vec3(.97,1.,.98):vKind>2.5&&vKind<3.5?vec3(.9,.94,.93):mix(vec3(.56,.77,.76),vec3(.96,1.,.98),smoothstep(.9,.06,length(p+vec2(.2,.2))));
if(a<.008)discard;gl_FragColor=vec4(c,a*.82);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
});
const particleCount = 480,
  ambientCount = 376;
function spray(G, kind, seed) {
  const r = rng(seed),
    geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
      3,
    ),
  );
  geo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  const origin = new Float32Array(particleCount * 3),
    velocity = new Float32Array(particleCount * 3),
    data = new Float32Array(particleCount * 4),
    seeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    seeds[i] = r() * 100;
    if (i >= ambientCount) {
      data[i * 4] = -100;
      data[i * 4 + 1] = 1;
      data[i * 4 + 3] = 3;
      continue;
    }
    let x, y, z, vx, vy, vz, size, mode, life;
    if (kind === 7 && i < 65) {
      x = (r() - 0.5) * 1.7;
      y = 2.32;
      z = (r() - 0.5) * 0.85;
      vx = 0;
      vy = -2.9;
      vz = 0;
      size = 0.008 + r() * 0.008;
      mode = 2;
      life = 0.77;
    } else if (i < 35 && G.feet.length) {
      const f = G.feet[i % G.feet.length],
        a = r() * Math.PI * 2;
      x = f[0] + Math.cos(a) * 0.05;
      y = 0.03;
      z = f[2] + Math.sin(a) * 0.05;
      vx = Math.cos(a) * 0.35;
      vy = 0.25 + r() * 0.4;
      vz = Math.sin(a) * 0.35;
      size = 0.028 + r() * 0.04;
      mode = 0;
      life = 0.25 + r() * 0.23;
    } else {
      const f = G.foamSeeds.length
        ? G.foamSeeds[i % G.foamSeeds.length]
        : [0, G.height * 0.6, 0, 0.03];
      x = f[0];
      y = f[1];
      z = f[2];
      vx = (r() - 0.5) * 0.7;
      vy = 0.16 + r() * 0.65;
      vz = (r() - 0.5) * 0.7;
      size = 0.025 + r() * 0.055;
      mode = i % 4 === 0 ? 1 : 0;
      life = 0.26 + r() * 0.48;
      if (i > 135 && G.foamSeeds.length) {
        mode = -1;
        size = 0.045 + r() * 0.095;
        vx = vy = vz = 0;
      }
    }
    origin.set([x, y, z], i * 3);
    velocity.set([vx, vy, vz], i * 3);
    data.set([-r() * life, life, size, mode], i * 4);
  }
  geo.setAttribute(
    "aOrigin",
    new THREE.InstancedBufferAttribute(origin, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geo.setAttribute(
    "aVelocity",
    new THREE.InstancedBufferAttribute(velocity, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geo.setAttribute(
    "aData",
    new THREE.InstancedBufferAttribute(data, 4).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geo.instanceCount = particleCount;
  const mesh = new THREE.Mesh(geo, sprayMaterial);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return { mesh, geo, origin, velocity, data, cursor: ambientCount };
}

// Opaque reef armor is sculpted separately and breaks into twelve pieces.
let reefGeo, cloudGeo;
const reefMaterials = [];
function reefMaterial(stage) {
  if (reefMaterials[stage]) return reefMaterials[stage];
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    envMapIntensity: 1.05,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader =
      "varying vec3 vReef;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvReef=position;",
      );
    s.fragmentShader =
      `varying vec3 vReef;${noiseGLSL}` +
      s.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float p=noise3(vReef*65.);float bands=sin(vReef.y*115.+noise3(vReef*12.)*8.);
diffuseColor.rgb*=.65+p*.44+bands*.06;
float crack=pow(1.-abs(sin(vReef.x*18.+vReef.y*23.+noise3(vReef*15.)*4.)),32.);
diffuseColor.rgb*=1.-crack*${stage === 0 ? "0.0" : stage === 1 ? ".82" : ".95"};
`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
normal=normalize(normal+vec3(sin(vReef.x*190.),cos(vReef.y*180.),sin(vReef.z*170.))*.11);`,
        );
  };
  m.customProgramCacheKey = () => "reef-" + stage;
  return (reefMaterials[stage] = m);
}
function mergeParts(parts) {
  const pos = [],
    col = [],
    norm = [],
    idx = [],
    piece = [];
  let offset = 0;
  for (const { g, color = 0xffffff, id = 0 } of parts) {
    const c = new THREE.Color(color),
      p = g.attributes.position,
      n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
      piece.push(id);
    }
    for (const i of g.index.array) idx.push(i + offset);
    offset += p.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.userData.piece = piece;
  return g;
}
function transformed(g, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function reef() {
  if (reefGeo) return reefGeo;
  const parts = [],
    r = rng(49);
  function branch(x, y, z, dx, dy, dz, rad, id, depth = 0) {
    const end = new THREE.Vector3(x + dx, y + dy, z + dz),
      start = new THREE.Vector3(x, y, z),
      dir = end.clone().sub(start),
      g = new THREE.CylinderGeometry(rad * 0.65, rad, dir.length(), 7, 3);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      ),
    );
    g.translate((x + end.x) / 2, (y + end.y) / 2, (z + end.z) / 2);
    parts.push({ g, color: depth ? 0xb95d3e : 0xb77f5f, id });
    parts.push({
      g: transformed(
        new THREE.SphereGeometry(rad * 0.82, 7, 5),
        end.x,
        end.y,
        end.z,
        1,
      ),
      color: 0xbd7450,
      id,
    });
    if (depth < 2)
      for (const sd of [-1, 1])
        branch(
          end.x,
          end.y,
          end.z,
          dx * 0.4 + sd * 0.09,
          dy * 0.62,
          dz * 0.4 + (r() - 0.5) * 0.15,
          rad * 0.64,
          id,
          depth + 1,
        );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2,
      x = Math.cos(a) * (i < 8 ? 0.55 : 0.95),
      z = Math.sin(a) * 0.36 + (i >= 8 ? 0.55 : 0),
      y = i < 8 ? 1.0 + r() * 0.12 : 0.69;
    // Corrugated fan shells rather than smooth pellets.
    const g = new THREE.SphereGeometry(
        1,
        22,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.72,
      ),
      p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const px = p.getX(j),
        pz = p.getZ(j),
        f = 1 + Math.cos(Math.atan2(pz, px) * 16) * 0.065;
      p.setXYZ(j, px * f, p.getY(j), pz * f);
    }
    g.computeVertexNormals();
    parts.push({
      g: transformed(
        g,
        x,
        y,
        z,
        0.24,
        0.11,
        0.22,
        0.55 + r() * 0.5,
        a,
        (r() - 0.5) * 0.6,
      ),
      color: i % 3 ? 0xbeb09a : 0xc9b997,
      id: i,
    });
    if (i % 2 === 0)
      branch(
        x,
        y,
        z,
        (r() - 0.5) * 0.15,
        0.34 + r() * 0.15,
        (r() - 0.5) * 0.1,
        0.025,
        i,
      );
    for (let j = 0; j < 6; j++) {
      const bx = x + (r() - 0.5) * 0.32,
        bz = z + (r() - 0.5) * 0.26;
      const b = new THREE.CylinderGeometry(0.025, 0.045, 0.045, 9, 1, true);
      parts.push({
        g: transformed(b, bx, y + 0.07, bz, 1),
        color: 0xaba898,
        id: i,
      });
    }
  }
  reefGeo = mergeParts(parts);
  const p = reefGeo.attributes.position,
    ids = reefGeo.userData.piece;
  const centers = Array.from({ length: 12 }, () => new THREE.Box3());
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++)
    centers[ids[i]].expandByPoint(v.fromBufferAttribute(p, i));
  const rotations = centers.map((_box, id) =>
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler((id % 2 ? 1 : -1) * 1.15, 0, ((id % 3) - 1) * 0.9),
    ),
  );
  const origins = centers.map((box) => box.getCenter(new THREE.Vector3()));
  const finalPositions = new Float32Array(p.count * 3),
    bottoms = new Float32Array(12).fill(Infinity);
  for (let i = 0; i < p.count; i++) {
    const id = ids[i],
      c = origins[id];
    v.fromBufferAttribute(p, i).sub(c).applyQuaternion(rotations[id]);
    finalPositions[i * 3] =
      v.x + c.x + (c.x < 0 ? -1 : 1) * (0.38 + (id % 3) * 0.12);
    finalPositions[i * 3 + 1] = v.y;
    finalPositions[i * 3 + 2] = v.z + c.z + 0.52 + (id % 4) * 0.06;
    bottoms[id] = Math.min(bottoms[id], v.y);
  }
  reefGeo.morphTargetsRelative = true;
  reefGeo.morphAttributes.position = [];
  for (let stage = 0; stage < 3; stage++) {
    const delta = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++)
      if (ids[i] % 3 === stage) {
        delta[i * 3] = finalPositions[i * 3] - p.getX(i);
        delta[i * 3 + 1] =
          finalPositions[i * 3 + 1] - bottoms[ids[i]] + 0.025 - p.getY(i);
        delta[i * 3 + 2] = finalPositions[i * 3 + 2] - p.getZ(i);
      }
    reefGeo.morphAttributes.position.push(new THREE.BufferAttribute(delta, 3));
  }
  return reefGeo;
}
const cloudMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  envMapIntensity: 0.4,
});
function cloud() {
  if (cloudGeo) return cloudGeo;
  const parts = [],
    r = rng(78);
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()),
      x = Math.cos(a) * d * 0.8,
      z = Math.sin(a) * d * 0.42,
      y = 2.37 + (1 - d) * 0.25 + r() * 0.16,
      s = 0.13 + r() * 0.13;
    const g = new THREE.SphereGeometry(1, 12, 9),
      p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const f =
        1 +
        0.09 *
          Math.sin(p.getX(j) * 13 + p.getY(j) * 8) *
          Math.cos(p.getZ(j) * 11);
      p.setXYZ(j, p.getX(j) * f, p.getY(j) * f, p.getZ(j) * f);
    }
    g.computeVertexNormals();
    parts.push({
      g: transformed(g, x, y, z, s * 1.3, s * 0.88, s),
      color: y > 2.53 ? 0x616b73 : 0x343f49,
    });
  }
  return (cloudGeo = mergeParts(parts));
}
const tmpHit = new THREE.Vector3();
let serial = 0;
export function createWaterCreature(kind, { scale } = {}) {
  kind = clamp(kind | 0, 0, 7);
  const def = CREATURES[kind],
    G = sculpture(kind),
    r = rng(++serial * 137 + kind);
  const group = new THREE.Group();
  group.scale.setScalar(scale === undefined ? def.s : scale);
  const pose = new THREE.Group();
  group.add(pose);
  // Each animal owns a local hit attribute; the sculpture is baked once and the physical material stays shared.
  const bodyGeo = G.geo.clone();
  const hitOffsets = new Float32Array(bodyGeo.attributes.position.count * 4);
  bodyGeo.setAttribute(
    "aBoil",
    new THREE.BufferAttribute(hitOffsets, 4).setUsage(THREE.DynamicDrawUsage),
  );
  const body = new THREE.Mesh(bodyGeo, water);
  pose.add(body);
  const wet = new THREE.Mesh(disc, wetMaterial);
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.009;
  wet.scale.set(
    kind === 5 ? 1.7 : kind === 1 ? 1.5 : 1.15,
    kind === 5 ? 1.35 : 1,
    1,
  );
  group.add(wet);
  const particles = spray(G, kind, serial * 157);
  group.add(particles.mesh);
  let armor = null,
    raincloud = null;
  if (kind === 6) {
    armor = new THREE.Mesh(reef(), reefMaterial(0));
    pose.add(armor);
  }
  if (kind === 7) {
    raincloud = new THREE.Mesh(cloud(), cloudMaterial);
    pose.add(raincloud);
  }
  let dying = false,
    deathAge = 0,
    dead = false,
    wind = 0,
    walk = 0,
    prev = "idle",
    attack = -1,
    hitAge = 10,
    shield = 1,
    heal = 0;
  let eventDirty = false;
  const armorTargets = [0, 0, 0];
  const phase = serial * 1.63;
  function emit(x, y, z, vx, vy, vz, size, mode, life) {
    const i = particles.cursor;
    particles.cursor =
      ambientCount + ((i - ambientCount + 1) % (particleCount - ambientCount));
    let a = i * 3;
    particles.origin[a] = x;
    particles.origin[a + 1] = y;
    particles.origin[a + 2] = z;
    particles.velocity[a] = vx;
    particles.velocity[a + 1] = vy;
    particles.velocity[a + 2] = vz;
    a = i * 4;
    particles.data[a] = time.value;
    particles.data[a + 1] = life;
    particles.data[a + 2] = size;
    particles.data[a + 3] = mode;
    eventDirty = true;
  }
  function burst(n, steam = false, x = 0, y = 0.3, z = 0) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2,
        v = 0.3 + r() * 1.1;
      emit(
        x + (r() - 0.5) * 0.3,
        y + (r() - 0.5) * 0.2,
        z + (r() - 0.5) * 0.3,
        Math.cos(a) * v,
        steam ? 0.45 + r() * 0.6 : 0.7 + r(),
        Math.sin(a) * v,
        steam ? 0.18 + r() * 0.14 : 0.04 + r() * 0.06,
        steam ? 3 : 4,
        steam ? 1.3 : 0.65,
      );
    }
  }
  function flush() {
    if (!eventDirty) return;
    eventDirty = false;
    particles.geo.attributes.aOrigin.needsUpdate = true;
    particles.geo.attributes.aVelocity.needsUpdate = true;
    particles.geo.attributes.aData.needsUpdate = true;
  }
  function update(dt, t, o) {
    time.value = t;
    dt = Math.min(dt, 0.05);
    if (dead) return;
    const state = o?.state || "idle",
      speed = o?.speed || 0,
      sea = !!o?.inSea;
    const target = !dying && state === "windup" ? 1 : 0;
    wind += (target - wind) * Math.min(1, dt * 5);
    if (state === "attack" && prev !== "attack") {
      attack = 0;
      if (kind === 2)
        for (let i = 0; i < 24; i++)
          emit(
            (r() - 0.5) * 0.04,
            1.69,
            1.3,
            (r() - 0.5) * 0.4,
            1.1 + r() * 0.4,
            5 + r() * 2,
            0.035 + r() * 0.045,
            4,
            0.45,
          );
      else burst(kind === 1 ? 35 : 16);
    }
    prev = state;
    attack = attack < 0 ? -1 : attack + dt;
    const strike =
      attack >= 0 && attack < 0.6 ? Math.sin((attack / 0.6) * Math.PI) : 0;
    walk += dt * (2 + speed * 2);
    hitAge += dt;
    const bob = Math.abs(Math.sin(walk)) * Math.min(speed * 0.012, 0.06),
      breath = Math.sin(t * 2 + phase) * 0.008;
    const boil =
      hitAge < 0.5 ? Math.sin(hitAge * 42) * 0.035 * (1 - hitAge * 2) : 0;
    let sx = 1 - breath,
      sy = 1 + breath + boil,
      sz = 1 - breath;
    body.morphTargetInfluences[0] = wind;
    pose.position.set(0, bob, kind === 3 ? strike * 0.72 - wind * 0.16 : 0);
    pose.rotation.set(
      (kind === 1 ? -wind * 0.08 : 0) + strike * 0.1,
      Math.sin(walk) * speed * 0.006,
      Math.sin(t * 1.1 + phase) * 0.008,
    );
    if (kind === 4 && wind > 0.1) {
      sx += Math.sin(t * 27) * wind * 0.018;
      sy += Math.cos(t * 31) * wind * 0.02;
      sz += Math.sin(t * 23) * wind * 0.018;
    }
    if (raincloud) {
      raincloud.position.y = Math.sin(t) * 0.025;
      heal += dt;
      const pulse = Math.pow(
        Math.max(0, Math.sin(heal * (state === "attack" ? 5 : 2))),
        12,
      );
      sx += pulse * 0.08;
      sz += pulse * 0.08;
    }
    if (dying) {
      deathAge += dt;
      const d = clamp(deathAge / 1.6),
        collapse = smooth(0.22, 0.88, d);
      sy *= 1 - collapse * 0.97;
      sx *= 1 + collapse * 0.7;
      sz *= 1 + collapse * 0.7;
      pose.position.y = 0;
      pose.rotation.x *= 1 - collapse;
      wet.scale.x = (kind === 5 ? 1.7 : 1.2) * (1 + collapse * 0.8);
      wet.scale.y = (kind === 5 ? 1.35 : 1) * (1 + collapse * 0.8);
      // Steam and collapse share the event pool. Wet stain remains after absorption.
      if (
        d < 0.8 &&
        Math.floor(deathAge * 25) !== Math.floor((deathAge - dt) * 25)
      )
        burst(3, true, r() - 0.5, G.height * 0.55 * sy, (r() - 0.5) * 0.6);
      if (d > 0.83) {
        sx *= 1 - smooth(0.83, 1, d) * 0.65;
        sz *= 1 - smooth(0.83, 1, d) * 0.65;
      }
      if (d >= 1) {
        pose.visible = false;
        dead = true;
        particles.geo.instanceCount = particleCount;
      }
    }
    pose.scale.set(sx, Math.max(0.01, sy), sz);
    if (armor) {
      for (let i = 0; i < 3; i++) {
        armor.morphTargetInfluences[i] +=
          (armorTargets[i] - armor.morphTargetInfluences[i]) *
          Math.min(1, dt * 5);
      }
    }
    // Ambient spray is animated entirely by the instanced vertex shader.
    // Sea contact adds a small burst only on state transition.
    if (sea && prevSea !== sea) burst(10);
    prevSea = sea;
    flush();
  }
  let prevSea = false;
  function hit(worldPoint, strength = 1) {
    if (dying || dead || !worldPoint) return;
    group.updateWorldMatrix(true, false);
    tmpHit.copy(worldPoint);
    group.worldToLocal(tmpHit);
    hitAge = 0;
    const px = tmpHit.x,
      py = tmpHit.y,
      pz = tmpHit.z,
      p = bodyGeo.attributes.position,
      n = bodyGeo.attributes.normal,
      m = bodyGeo.morphAttributes.position[0];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + m.getX(i) * wind - px,
        y = p.getY(i) + m.getY(i) * wind - py,
        z = p.getZ(i) + m.getZ(i) * wind - pz;
      const f =
        Math.exp(-(x * x + y * y + z * z) / 0.085) *
        0.11 *
        (0.65 + Math.sin(x * 57 + y * 41 + z * 31) * 0.35);
      hitOffsets[i * 4] = n.getX(i) * f;
      hitOffsets[i * 4 + 1] = n.getY(i) * f;
      hitOffsets[i * 4 + 2] = n.getZ(i) * f;
      hitOffsets[i * 4 + 3] = time.value;
    }
    bodyGeo.attributes.aBoil.needsUpdate = true;
    burst(
      Math.min(26, 8 + Math.round(strength * 8)),
      true,
      tmpHit.x,
      tmpHit.y,
      tmpHit.z,
    );
    burst(8, false, tmpHit.x, tmpHit.y, tmpHit.z);
    flush();
  }
  function startDeath() {
    if (!dying) {
      dying = true;
      for (let i = 0; i < ambientCount; i++) {
        particles.data[i * 4] = time.value;
        particles.data[i * 4 + 3] = 4;
      }
      eventDirty = true;
      burst(30);
      burst(14, true, 0, G.height * 0.5, 0);
      flush();
    }
    return 1.6;
  }
  function setShield(frac) {
    if (!armor) return;
    shield = clamp(frac);
    armor.material = reefMaterial(shield > 0.66 ? 0 : shield > 0.33 ? 1 : 2);
    armorTargets[0] = shield <= 0.66 ? 1 : 0;
    armorTargets[1] = shield <= 0.33 ? 1 : 0;
    armorTargets[2] = shield <= 0 ? 1 : 0;
  }
  function dispose() {
    group.removeFromParent();
    particles.geo.dispose();
    bodyGeo.dispose();
  }
  return {
    group,
    radius: def.radius * (scale === undefined ? def.s : scale),
    update,
    hit,
    startDeath,
    setShield,
    dispose,
  };
}
