import * as THREE from "three";
import { scene } from "../core/state.js";
export const shoreZ = (x) =>
  15.1 +
  Math.sin(x * 0.11) * 0.7 +
  Math.sin(x * 0.037 + 1.7) * 1.1 +
  Math.sin(x * 0.27 + 0.5) * 0.25;
export const seaZ = (x) => shoreZ(x) + 0.4; // where the mean waterline sits = gameplay boundary for "in the ocean"
export const inSea = (x, z) => z > seaZ(x);
const _q = (u) => (u <= 0 ? 0 : u < 1 ? u * u * 0.5 : u - 0.5);
export const bedY = (x, z) => Math.max(-1.45, -0.09 * _q(z - shoreZ(x) + 1.2));

let oceanMat;
export function initOcean() {
  // tiny random texture = cheap value noise for ripples and foam (bilinear filtering smooths it; far cheaper than hash noise per pixel)
  const _noiseTex = (() => {
    const n = 128,
      d = new Uint8Array(n * n * 4);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 255;
    const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();
  const _skyCol = (r, g, b) =>
    new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const SEA_GLSL = `
float shoreZ(float x){return 15.1+sin(x*.11)*.7+sin(x*.037+1.7)*1.1+sin(x*.27+.5)*.25;}
float qr(float u){return u<=0.?0.:(u<1.?u*u*.5:u-.5);}
float bedY(vec2 p){return max(-1.45,-.09*qr(p.y-shoreZ(p.x)+1.2));}
vec3 wv(vec2 p,vec2 dir,float k,float amp,float sp,float t){float ph=k*dot(p,dir)+sp*t;return vec3(amp*sin(ph),amp*k*cos(ph)*dir.x,amp*k*cos(ph)*dir.y);}
`;
  oceanMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uNoise: { value: _noiseTex },
        uShallow: { value: _skyCol(0.26, 0.86, 0.8) },
        uMid: { value: _skyCol(0.08, 0.66, 0.82) },
        uDeep: { value: _skyCol(0.03, 0.3, 0.62) },
        uSkyH: { value: _skyCol(0.98, 0.93, 0.78) },
        uSkyZ: { value: _skyCol(0.25, 0.72, 0.95) },
        uFoam: { value: _skyCol(1, 1, 1) },
        uSunCol: { value: _skyCol(1, 0.95, 0.8) },
        uSunDir: { value: new THREE.Vector3(-28, 42, 22).normalize() },
      },
    ]),
    vertexShader: `
    uniform float uTime; varying vec3 vWorld; varying vec3 vN; varying float vD;
    #include <fog_pars_vertex>
    ${SEA_GLSL}
    void main(){
      vec3 p=position; float d=p.z-shoreZ(p.x); float calm=smoothstep(0.,6.,d);
      float level=-.10+.05*sin(uTime*.8);
      vec3 w=wv(p.xz,normalize(vec2(.15,1.)),.52,.11,1.1,uTime)+wv(p.xz,normalize(vec2(-.6,.8)),.9,.06,1.5,uTime)+wv(p.xz,normalize(vec2(.8,.5)),1.9,.025,2.2,uTime);
      p.y=level+w.x*calm;
      vN=normalize(vec3(-w.y*calm,1.,-w.z*calm)); vD=d;
      vWorld=p;
      vec4 mvPosition=viewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
    fragmentShader: `
    uniform float uTime; uniform sampler2D uNoise; uniform vec3 uShallow,uMid,uDeep,uSkyH,uSkyZ,uFoam,uSunCol,uSunDir; varying vec3 vWorld; varying vec3 vN; varying float vD;
    #include <fog_pars_fragment>
    ${SEA_GLSL}
    vec4 nz(vec2 p){return texture2D(uNoise,p*(1./128.));}
    void main(){
      vec2 p=vWorld.xz; float d=vD;
      float depth=vWorld.y-max(-1.45,-.09*qr(d+1.2));
      if(depth<=0.) discard;
      vec3 N=normalize(vN); // swell normal from the vertex shader; fine ripples come from the noise texture below
      vec2 n1=nz(p*1.9+vec2(uTime*.35,uTime*.2)).rg-.5;
      N=normalize(N+vec3(n1.x,0.,n1.y)*.12);
      vec3 V=normalize(cameraPosition-vWorld);
      float ndv=clamp(dot(N,V),0.,1.);
      // body colour: pale turquoise in the shallows, deeper blue with depth and distance from shore
      vec3 body=mix(uShallow,uMid,smoothstep(.05,1.2,depth));
      body=mix(body,uDeep,smoothstep(3.,34.,d));
      body*=.82+.28*max(dot(N,uSunDir),0.);
      // fresnel sky reflection
      vec3 R=reflect(-V,N);
      vec3 sky=mix(uSkyH,uSkyZ,smoothstep(-.05,.55,R.y));
      float fres=clamp(.03+.62*pow(1.-ndv,4.),0.,.62);
      vec3 col=mix(body,sky,fres);
      float alpha=mix(.22,.97,smoothstep(0.,1.0,depth));
      alpha=mix(alpha,1.,fres*.45);
      // soft sun specular + glitter
      vec3 H=normalize(uSunDir+V);
      float sp=pow(max(dot(N,H),0.),240.)*2.2+pow(max(dot(N,H),0.),38.)*.14;
      col+=uSunCol*sp; alpha=max(alpha,clamp(sp,0.,1.));
      // shore foam: lacy swash at the waterline + a few soft foam lines rolling in
      float fn=nz(p*vec2(1.2,2.0)+vec2(uTime*.06,uTime*.1)).b*.6+nz(p*4.+vec2(uTime*.12,-uTime*.08)).a*.4;
      float edge=1.-smoothstep(0.,.16+.3*fn,depth);
      float saw=fract(d*.085+uTime*.045);
      float crest=exp(-pow((saw-.5)/.09,2.));
      float lace=smoothstep(.4,.62,nz(p*vec2(.9,1.6)+vec2(uTime*.2,uTime*.12)).r);
      float lines=crest*lace*(1.-smoothstep(4.,18.,d))*smoothstep(.5,2.5,d);
      float foam=clamp(edge*(.7+.5*fn)+lines*.75,0.,1.);
      col=mix(col,uFoam,foam*.9); alpha=max(alpha,foam*.92);
      gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
  });
  const ocean = new THREE.Mesh(
    (() => {
      const g = new THREE.PlaneGeometry(340, 114, 170, 57);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, 63);
      return g;
    })(),
    oceanMat,
  );
  ocean.frustumCulled = false;
  scene.add(ocean);
}
export function updateOcean(t) {
  oceanMat.uniforms.uTime.value = t;
}
