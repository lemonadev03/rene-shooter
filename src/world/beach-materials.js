import * as THREE from "three";
import { loadTexture, trackAssetTask } from "../core/assets.js";
import { quality } from "../core/quality.js";

const detail = { value: 1 };
export function updateSandQuality() {
  detail.value = quality.tier === "low" ? 0 : 1;
}

async function maps(id) {
  const textures = await Promise.all(
    ["diff", "nor_gl", "arm"].map((channel) =>
      loadTexture(
        new URL(`../../assets/beach/${id}_${channel}.webp`, import.meta.url)
          .href,
        {
          colorSpace:
            channel === "diff" ? THREE.SRGBColorSpace : THREE.NoColorSpace,
        },
      ),
    ),
  );
  for (const t of textures) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 2;
  }
  return textures;
}

export function createBeachMaterials() {
  const noiseData = new Uint8Array(128 * 128);
  let seed = 48317;
  for (let i = 0; i < noiseData.length; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    noiseData[i] = seed >>> 24;
  }
  const noise = new THREE.DataTexture(noiseData, 128, 128, THREE.RedFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = noise.minFilter = THREE.LinearFilter;
  noise.needsUpdate = true;
  const sand = new THREE.MeshStandardMaterial({ roughness: 0.96 });
  const wood = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const deck = wood.clone(),
    tower = wood.clone();
  trackAssetTask(
    "beach-surfaces",
    (async () => {
      const [dry, wet, weathered, planks] = await Promise.all([
        maps("coast_sand_01"),
        maps("damp_beach_sand"),
        maps("weathered_planks"),
        maps("wood_planks"),
      ]);
      Object.assign(sand, {
        map: dry[0],
        normalMap: dry[1],
        roughnessMap: dry[2],
        aoMap: dry[2],
        aoMapIntensity: 0.3,
      });
      sand.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
          beachWet: { value: wet[0] },
          beachWetNormal: { value: wet[1] },
          beachWetArm: { value: wet[2] },
          beachDetail: detail,
          beachNoiseMap: { value: noise },
        });
        shader.vertexShader =
          `varying vec3 vBeach; varying float vBeachDistance;
float beachShore(float x) { return 15.1+sin(x*.11)*.7+sin(x*.037+1.7)*1.1+sin(x*.27+.5)*.25; }
` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvBeach = (modelMatrix * vec4(transformed, 1.)).xyz;vBeachDistance=vBeach.z-beachShore(vBeach.x);",
        );
        shader.fragmentShader =
          `
varying vec3 vBeach; varying float vBeachDistance;
uniform sampler2D beachWet, beachWetNormal, beachWetArm, beachNoiseMap;
uniform float beachDetail;
float beachNoise(vec2 p) { return texture2D(beachNoiseMap,(p+.5)*(1./128.)).r; }
// Two incommensurate, rotated scales blend over metre-sized patches. All maps
// use world space, including the slope and dunes; the z=9 join cannot shift UVs.
vec4 beachSample(sampler2D tex, vec2 uv, float blend) {
  return mix(texture2D(tex,uv),texture2D(tex,mat2(.8,-.6,.6,.8)*uv*.617+vec2(.37,.73)),blend);
}
` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
vec2 beachUv=vec2(vBeach.x,-vBeach.z)*.24;
float beachDistance=vBeachDistance;
float beachMix=.5, beachMoisture=1.;
if(beachDistance<8.) {
  beachMix=smoothstep(.15,.85,beachNoise(vBeach.xz*.18));
  beachMoisture=smoothstep(-3.3,-.7,beachDistance+(beachNoise(vBeach.xz*.65)-.5)*.5);
}
// At >8 m offshore the almost opaque water hides grain; avoid spending the
// shoreline's texture budget on the deep bed, while retaining its PBR lighting.
bool beachGrain=beachDistance<8.;
vec3 beachDry=vec3(.35,.29,.21), beachDamp=vec3(.16,.14,.11);
if(beachGrain) {
  beachDry=beachSample(map,beachUv,beachMix).rgb;
  beachDamp=beachSample(beachWet,beachUv*.86,beachMix).rgb;
}
// Neutral cream dry grains and compacted, warmer damp sand, under the real sun.
diffuseColor.rgb *= mix(beachDry*vec3(4.2,3.9,3.65),beachDamp*vec3(3.0,2.9,3.9),beachMoisture);
// A sparse pressed trail: alternating heel/toe depressions rather than decals.
float trailZ=11.0+sin(vBeach.x*.11)*.8;
vec2 foot=vec2(mod(vBeach.x+40.,.78)-.39,vBeach.z-trailZ+(mod(floor((vBeach.x+40.)/.78),2.)-.5)*.3);
float sole=1.-smoothstep(.75,1.2,length(foot/vec2(.17,.09)));
sole*=smoothstep(-28.,-24.,vBeach.x)*(1.-smoothstep(24.,28.,vBeach.x));
diffuseColor.rgb*=1.-sole*.13;
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `
vec3 dryArm=vec3(1.,.9,0.), wetArm=vec3(1.,.4,0.);
if(beachGrain) { dryArm=texture2D(roughnessMap,beachUv).rgb; wetArm=texture2D(beachWetArm,beachUv*.86).rgb; }
float beachDryR=dryArm.g;
float beachWetR=wetArm.g;
float roughnessFactor=mix(.82+.16*beachDryR,.19+.15*beachWetR,beachMoisture);
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_maps>",
          `
vec3 sandN=vec3(0.,0.,1.);
if(beachGrain) {
  sandN=texture2D(normalMap,beachUv).xyz*2.-1.;
if(beachDetail>.5) {
  vec3 fineN=texture2D(normalMap,beachUv*3.17+vec2(.27,.61)).xyz*2.-1.;
  sandN.xy+=fineN.xy*.23;
}
vec3 wetN=texture2D(beachWetNormal,beachUv*.86).xyz*2.-1.;
sandN=normalize(mix(vec3(sandN.xy*.45,sandN.z),vec3(wetN.xy*.18,wetN.z),beachMoisture));
}
normal=normalize(tbn*sandN);
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <aomap_fragment>",
          `
float beachAO=mix(dryArm.r,wetArm.r,beachMoisture);
reflectedLight.indirectDiffuse*=mix(1.,beachAO,.3);
`,
        );
      };
      sand.customProgramCacheKey = () => "beach-world-sand-1";
      sand.needsUpdate = true;
      for (const [material, set, repeat] of [
        [wood, weathered, [1, 2]],
        [deck, weathered, [1.8, 12.5]],
        [tower, planks, [1.3, 1.3]],
      ]) {
        const copies = set.map((texture) => {
          const t = texture.clone();
          t.repeat.set(...repeat);
          return t;
        });
        Object.assign(material, {
          map: copies[0],
          normalMap: copies[1],
          roughnessMap: copies[2],
          aoMap: copies[2],
          aoMapIntensity: 0.4,
        });
        material.normalScale.set(0.45, 0.45);
        material.needsUpdate = true;
      }
    })(),
  );
  return { sand, wood, deck, tower };
}
