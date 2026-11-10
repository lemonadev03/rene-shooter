import * as THREE from "three";
import { rand, mat, sph } from "../core/utils.js";
import { scene } from "../core/state.js";
let sun;
let clouds = [];
export function initSky() {
  sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.position.set(-28, 42, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    innerWidth < 820 ? 1024 : 2048,
    innerWidth < 820 ? 1024 : 2048,
  );
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfeaff, 0xf2d38a, 1.0));
  // sky dome gradient + sun disc
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(260, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader:
        "varying vec3 v; void main(){v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec3 v; void main(){float h=normalize(v).y; vec3 c=mix(vec3(.98,.93,.78),vec3(.25,.72,.95),smoothstep(-.05,.55,h)); c=mix(c,vec3(.1,.5,.9),smoothstep(.5,1.,h)*.6); gl_FragColor=vec4(c,1.);}",
    }),
  );
  scene.add(sky);
  // clouds
  clouds = [];
  const cloudMat = mat(0xffffff, 0.9, 0, {
    transparent: true,
    opacity: 0.92,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const s = sph(
        rand(1.6, 3.2),
        cloudMat,
        j * 2.2 - 3,
        rand(-0.4, 0.4),
        rand(-1, 1),
      );
      s.scale.y = 0.55;
      s.castShadow = false;
      g.add(s);
    }
    g.position.set(rand(-90, 90), rand(22, 34), rand(-70, 70));
    scene.add(g);
    clouds.push(g);
  }
}
export function updateSky(dt) {
  clouds.forEach((c, i) => {
    c.position.x += dt * (0.4 + i * 0.07);
    if (c.position.x > 110) c.position.x = -110;
  });
}
export { sun };
