import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { scene, camera, state } from "./state.js";
import { vmScene, vmCamera } from "../weapons/viewmodel.js";
import { quality } from "./quality.js";

// OutputPass reads renderer.toneMapping in r187. Limit ACES to this one full-screen pass.
class FilmOutputPass extends OutputPass {
  render(renderer, ...args) {
    const toneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    try {
      super.render(renderer, ...args);
    } finally {
      renderer.toneMapping = toneMapping;
    }
  }
}
// The calibration frames draw the weapon so its programs compile and its cost is
// measured, but they also reach the canvas behind the title. A zero-size scissor
// keeps the draws and drops every pixel.
class ViewmodelPass extends RenderPass {
  hidden = false;
  render(renderer, writeBuffer, readBuffer, ...args) {
    if (!this.hidden) {
      super.render(renderer, writeBuffer, readBuffer, ...args);
      return;
    }
    readBuffer.scissorTest = true;
    readBuffer.scissor.set(0, 0, 0, 0);
    try {
      super.render(renderer, writeBuffer, readBuffer, ...args);
    } finally {
      readBuffer.scissorTest = false;
    }
  }
}
class ScaledAO extends GTAOPass {
  setSize(width, height) {
    const scale = quality.tier === "ultra" ? 0.67 : 0.5;
    super.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
  }
  render(renderer, ...args) {
    // The world's RenderPass already refreshed the single sun shadow map this frame.
    const autoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      super.render(renderer, ...args);
    } finally {
      renderer.shadowMap.autoUpdate = autoUpdate;
    }
  }
}
class ScaledBloom extends UnrealBloomPass {
  setSize(width, height) {
    super.setSize(
      Math.max(1, Math.round(width * quality.bloomScale)),
      Math.max(1, Math.round(height * quality.bloomScale)),
    );
  }
}

export function createPost(renderer) {
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
  });
  target.texture.name = "World HDR";
  const composer = new EffectComposer(renderer, target);
  const world = new RenderPass(scene, camera);
  composer.addPass(world);
  const ao = new ScaledAO(scene, camera);
  ao.blendIntensity = 0.45;
  ao.updateGtaoMaterial({
    radius: 0.55,
    thickness: 0.8,
    distanceExponent: 2,
    distanceFallOff: 0.8,
    samples: 8,
  });
  ao.updatePdMaterial({ samples: 8, radius: 6 });
  composer.addPass(ao);
  const viewmodel = new ViewmodelPass(vmScene, vmCamera);
  viewmodel.clear = false;
  viewmodel.clearDepth = true;
  composer.addPass(viewmodel);
  const bloom = new ScaledBloom(new THREE.Vector2(256, 256), 0.08, 0.3, 1.0);
  composer.addPass(bloom);
  composer.addPass(new FilmOutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 source=texture2D(tDiffuse,vUv);
        vec3 c=(source.rgb-0.5)*1.035+0.5;
        c=mix(vec3(dot(c,vec3(0.2126,0.7152,0.0722))),c,1.04);
        c*=vec3(1.012,1.003,0.99);
        vec2 p=(vUv-0.5)*2.0;
        c*=1.0-0.065*smoothstep(0.3,1.65,dot(p,p));
        gl_FragColor=vec4(clamp(c,0.0,1.0),source.a);
      }`,
  });
  composer.addPass(grade);
  const smaa = new SMAAPass();
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(smaa);
  composer.addPass(fxaa);
  const environmentRotation = new THREE.Quaternion();
  const worldRotation = new THREE.Quaternion();
  function resize(width, height, scale) {
    const w = Math.max(1, Math.round(width * scale)),
      h = Math.max(1, Math.round(height * scale));
    ao.enabled = quality.gtao;
    smaa.enabled = quality.tier !== "low";
    fxaa.enabled = quality.tier === "low";
    composer.setSize(w, h);
    fxaa.uniforms.resolution.value.set(1 / w, 1 / h);
  }
  function render(dt) {
    viewmodel.enabled = state.mode === "play" || quality.warmingUp;
    viewmodel.hidden = state.mode !== "play";
    // The weapon lives in camera space; rotate its IBL back into that same space.
    environmentRotation.copy(camera.quaternion).invert();
    worldRotation.setFromEuler(scene.environmentRotation);
    vmScene.environmentRotation.setFromQuaternion(
      environmentRotation.multiply(worldRotation),
    );
    composer.render(dt);
  }
  async function warmVariants() {
    // Only the GTAO pass draws the normal G-buffer; low and medium never do.
    if (!ao.enabled) return;
    const target = renderer.getRenderTarget();
    const materials = [];
    // compileAsync does not honor scene.overrideMaterial. Give it the actual
    // G-buffer material for every mesh so geometry/order cannot hide a variant.
    scene.traverse((object) => {
      if (!object.isMesh) return;
      materials.push([object, object.material]);
      object.material = ao.normalMaterial;
    });
    try {
      renderer.setRenderTarget(ao.normalRenderTarget);
      await renderer.compileAsync(scene, camera);
    } finally {
      for (const [object, material] of materials) object.material = material;
      ao.normalMaterial.needsUpdate = true;
      renderer.setRenderTarget(target);
    }
  }
  return { composer, resize, render, warmVariants };
}
