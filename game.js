import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ===== helpers =====
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function canvasTex(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function mat(color,rough=.7,metal=0,extra={}){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,...extra});}
// shared-geometry cache: mesh scale/rotation differ, geometry never mutated per-mesh
const _geoCache=new Map();
function _geo(key,make){let g=_geoCache.get(key);if(!g){g=make();_geoCache.set(key,g);}return g;}
function box(w,h,d,m,x=0,y=0,z=0){const ms=new THREE.Mesh(_geo(`b${w},${h},${d}`,()=>new THREE.BoxGeometry(w,h,d)),m);ms.position.set(x,y,z);ms.castShadow=true;ms.receiveShadow=true;return ms;}
function cyl(rt,rb,h,m,x=0,y=0,z=0,seg=14){const ms=new THREE.Mesh(_geo(`c${rt},${rb},${h},${seg}`,()=>new THREE.CylinderGeometry(rt,rb,h,seg)),m);ms.position.set(x,y,z);ms.castShadow=true;return ms;}
function sph(r,m,x=0,y=0,z=0,w=18,h=14){const ms=new THREE.Mesh(_geo(`s${r},${w},${h}`,()=>new THREE.SphereGeometry(r,w,h)),m);ms.position.set(x,y,z);ms.castShadow=true;return ms;}

// ===== renderer / scene =====
const canvas=$('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
let _pxRatio=Math.min(devicePixelRatio,1.5); // cap fill cost on retina; adaptive step-down in loop if frame time sags
renderer.setPixelRatio(_pxRatio);
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x79d4f2);
scene.fog=new THREE.Fog(0xaee7f7,55,150);
const pmrem=new THREE.PMREMGenerator(renderer); scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture; scene.environmentIntensity=.35;
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,400);
const sun=new THREE.DirectionalLight(0xfff2d0,2.6); sun.position.set(-28,42,22); sun.castShadow=true;
sun.shadow.mapSize.set(innerWidth<820?1024:2048,innerWidth<820?1024:2048); sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.camera.far=120;sun.shadow.bias=-.0004; scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfeaff,0xf2d38a,1.0));
// sky dome gradient + sun disc
const sky=new THREE.Mesh(new THREE.SphereGeometry(260,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 v; void main(){v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v; void main(){float h=normalize(v).y; vec3 c=mix(vec3(.98,.93,.78),vec3(.25,.72,.95),smoothstep(-.05,.55,h)); c=mix(c,vec3(.1,.5,.9),smoothstep(.5,1.,h)*.6); gl_FragColor=vec4(c,1.);}'})); scene.add(sky);

// ===== world: beach =====
const colliders=[]; // {x,z,r}
const sandTex=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#f0d488';g.fillRect(0,0,w,h);for(let i=0;i<9000;i++){g.fillStyle=['#e8c975','#f7e3a0','#d9b95f','#fff3c4'][i%4];g.fillRect(Math.random()*w,Math.random()*h,2,2);}});
sandTex.wrapS=sandTex.wrapT=THREE.RepeatWrapping; sandTex.repeat.set(18,12);
const sand=new THREE.Mesh(new THREE.PlaneGeometry(340,110),new THREE.MeshStandardMaterial({map:sandTex,roughness:.95}));
sand.rotation.x=-Math.PI/2; sand.position.set(0,0,-12); sand.receiveShadow=true; scene.add(sand);
// ocean
const oceanMat=new THREE.MeshStandardMaterial({color:0x1598c8,roughness:.18,metalness:.05,transparent:true,opacity:.92,emissive:0x073a55,emissiveIntensity:.35});
const ocean=new THREE.Mesh(new THREE.PlaneGeometry(300,90,36,14),oceanMat);
ocean.rotation.x=-Math.PI/2; ocean.position.set(0,-.18,58); scene.add(ocean);
const oceanBase=ocean.geometry.attributes.position.array.slice();
// foam shoreline strips
const foams=[];
for(let i=0;i<3;i++){const f=new THREE.Mesh(new THREE.PlaneGeometry(150,1.6),mat(0xffffff,.4,0,{transparent:true,opacity:.75}));f.rotation.x=-Math.PI/2;f.position.set(0,.02,17.5+i*2.2);scene.add(f);foams.push(f);}
// dunes at back
for(let i=0;i<9;i++){const d=sph(rand(4,8),mat(0xeccf7d,.95),-55+i*13+rand(-2,2),-1.5,-46+rand(-2,2));d.scale.y=.38;d.castShadow=false;scene.add(d);}
// distant islands
[[-75,95],[55,115],[95,80]].forEach(([x,z])=>{const isl=new THREE.Mesh(new THREE.ConeGeometry(rand(9,15),rand(4,7),7),mat(0x3f9e5f,.9));isl.position.set(x,0,z);scene.add(isl);});
// clouds
const clouds=[];
const cloudMat=mat(0xffffff,.9,0,{transparent:true,opacity:.92,emissive:0xffffff,emissiveIntensity:.25});
for(let i=0;i<10;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const s=sph(rand(1.6,3.2),cloudMat,j*2.2-3,rand(-.4,.4),rand(-1,1));s.scale.y=.55;s.castShadow=false;g.add(s);}g.position.set(rand(-90,90),rand(22,34),rand(-70,70));scene.add(g);clouds.push(g);}
// palm tree
const trunkMat=mat(0x8a6242,.9), leafMat=mat(0x21a356,.8,0,{side:THREE.DoubleSide}), cocoMat=mat(0x6b4a26,.8);
function palm(x,z,lean=0.25,s=1){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const curve=new THREE.CatmullRomCurve3([V3(0,0,0),V3(lean*1.2,2.2,0),V3(lean*3,4.6,0)]);
  const trunk=new THREE.Mesh(new THREE.TubeGeometry(curve,8,.22,8),trunkMat); trunk.castShadow=true; g.add(trunk);
  const top=V3(lean*3,4.7,0);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const leaf=new THREE.Mesh(new THREE.PlaneGeometry(3.6,.6,6,1),leafMat);const pos=leaf.geometry.attributes.position;for(let v=0;v<pos.count;v++){const px=pos.getX(v);pos.setZ(v,-Math.pow(Math.max(0,px),2)*.22);}leaf.geometry.computeVertexNormals();const dir=V3(Math.cos(a),0,Math.sin(a));leaf.position.copy(top).addScaledVector(dir,1.6);leaf.position.y+=.18;leaf.rotation.order='YXZ';leaf.rotation.y=-a;leaf.rotation.x=-Math.PI/2+.3;leaf.castShadow=true;g.add(leaf);}
  g.add(sph(.24,cocoMat,top.x+.3,top.y-.3,.15),sph(.22,cocoMat,top.x-.25,top.y-.3,-.1));
  g.scale.setScalar(s); g.rotation.y=rand(0,6.28); scene.add(g); colliders.push({x,z,r:.55});
}
[[-20,-28],[-32,-12],[-26,8],[24,-30],[34,-14],[28,6],[-8,-36],[12,-34],[-42,-22],[44,-24],[6,10],[-14,12]].forEach(([x,z])=>palm(x,z,rand(.1,.45)*(Math.random()<.5?-1:1),rand(.9,1.25)));
// umbrellas + towels + beach balls
const umbCols=[0xff4d6d,0xffb020,0x00b4d8,0x7c3aed,0xff6b35];
function umbrella(x,z,c){const g=new THREE.Group();g.position.set(x,0,z);const pole=cyl(.05,.05,2.6,mat(0xdddddd,.4,.6),0,1.3,0);g.add(pole);const top=new THREE.Mesh(new THREE.ConeGeometry(1.9,.65,10,1,true),mat(c,.6,0,{side:THREE.DoubleSide}));top.position.y=2.6;top.castShadow=true;g.add(top);g.rotation.z=.12;scene.add(g);colliders.push({x,z,r:.35});
  const tow=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2),mat(c,.9));tow.rotation.x=-Math.PI/2;tow.rotation.z=rand(0,3);tow.position.set(x+1.2,.03,z+.6);tow.receiveShadow=true;scene.add(tow);}
[[-12,-6],[14,-2],[-4,6],[20,10],[-24,2]].forEach(([x,z],i)=>umbrella(x,z,umbCols[i]));
[[-18,-9],[22,-6],[-11,9],[16,-24],[-28,-18]].forEach(([x,z],i)=>{const b=sph(.42,mat(umbCols[i],.25),x,.42,z);scene.add(b);});
// volleyball net
{const g=new THREE.Group();g.position.set(-16,0,-16);g.rotation.y=.5;const pm=mat(0xffffff,.5,.4);g.add(cyl(.06,.06,2.4,pm,-3,1.2,0),cyl(.06,.06,2.4,pm,3,1.2,0));const net=new THREE.Mesh(new THREE.PlaneGeometry(6,.9),mat(0xffffff,.8,0,{transparent:true,opacity:.45,side:THREE.DoubleSide}));net.position.y=1.85;g.add(net);scene.add(g);colliders.push({x:-16,z:-16,r:1.2});}
// lifeguard tower
{const g=new THREE.Group();g.position.set(17,0,-18);g.rotation.y=-.4;const wm=mat(0xf4f4f4,.7),rm=mat(0xe63946,.6);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([x,z])=>{const l=box(.18,3,.18,wm,x,1.5,z);l.rotation.z=x*.12;l.rotation.x=-z*.12;g.add(l);});g.add(box(2.8,.18,2.8,wm,0,3,0));g.add(box(2.4,1.6,2.2,wm,0,3.9,0));const roof=new THREE.Mesh(new THREE.ConeGeometry(2.2,.8,4),rm);roof.position.y=5.1;roof.rotation.y=Math.PI/4;roof.castShadow=true;g.add(roof);g.add(box(2.45,.9,.08,mat(0x87ceeb,.2,.2),0,4.05,1.12));scene.add(g);colliders.push({x:17,z:-18,r:2});}
// rocks + crates
[[ -34,10],[36,12],[-6,-24],[8,-8]].forEach(([x,z])=>{const r=new THREE.Mesh(new THREE.DodecahedronGeometry(rand(.7,1.3)),mat(0x8d99ae,.9));r.position.set(x,.5,z);r.castShadow=true;r.receiveShadow=true;scene.add(r);colliders.push({x,z,r:1.1});});
[[4,-20],[5.2,-20],[-22,-26]].forEach(([x,z])=>{scene.add(box(1,1,1,mat(0xb08954,.85),x,.5,z));colliders.push({x,z,r:.8});});
// inflatable refill stations (buckets)
const refillSpots=[];
[[-9,13],[11,13.5],[0,-28]].forEach(([x,z])=>{const b=cyl(.55,.42,.7,mat(0x2196f3,.4),x,.35,z);scene.add(b);const w=cyl(.48,.48,.06,mat(0x7dd3fc,.15),x,.72,z);scene.add(w);refillSpots.push({x,z,r:3.2});});

// ===== PLAYER — modelled on the photo: Ateneo #2 =====
// white jersey blue trim "ATENEO" + 2, blue shorts, grey brace on LEFT knee, white shoes, short black hair
const jerseyFront=canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#f7f7f5';g.fillRect(0,0,w,h);
  g.fillStyle='#1046c8';g.fillRect(0,0,26,h);g.fillRect(w-26,0,26,h); // side trim hint at edges
  g.fillStyle='#f7f7f5';g.fillRect(26,0,w-52,h);
  g.strokeStyle='#1046c8';g.lineWidth=10;g.beginPath();g.moveTo(w/2-52,0);g.lineTo(w/2,62);g.lineTo(w/2+52,0);g.stroke(); // V neck
  g.fillStyle='#1046c8';g.font='bold 30px Georgia,serif';g.textAlign='center';g.fillText('ATENEO',w/2,118);
  g.font='bold 92px Georgia,serif';g.fillText('2',w/2,212);
  g.font='bold 13px Arial';g.fillStyle='#d98a00';g.beginPath();g.arc(52,58,15,0,7);g.fill();g.fillStyle='#fff';g.fillText('★',52,63);
  g.fillStyle='#1a5a9e';g.beginPath();g.arc(w-52,58,15,0,7);g.fill();g.fillStyle='#fff';g.fillText('A',w-52,63);
});
const jerseyBack=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#f7f7f5';g.fillRect(0,0,w,h);g.strokeStyle='#1046c8';g.lineWidth=10;g.beginPath();g.moveTo(w/2-52,0);g.lineTo(w/2,50);g.lineTo(w/2+52,0);g.stroke();g.fillStyle='#1046c8';g.font='bold 26px Georgia,serif';g.textAlign='center';g.fillText('RENE',w/2,88);g.font='bold 120px Georgia,serif';g.fillText('2',w/2,215);});
const skinMat=mat(0xa57146,.55), skinDark=mat(0x8d5c36,.6), hairMat=mat(0x14110e,.85);
const blueMat=mat(0x1447d6,.65), whiteMat=mat(0xf5f5f0,.5), greyMat=mat(0x6b7280,.8), darkGrey=mat(0x374151,.8);
function buildPlayer(){
  const root=new THREE.Group(); // origin at feet, faces +Z when rotation 0? we face -Z forward via model look; model built facing +Z
  const hips=new THREE.Group(); hips.position.y=.98; root.add(hips);
  // torso jersey box with texture faces: order +x,-x,+y,-y,+z,-z
  const sideM=new THREE.MeshStandardMaterial({color:0xf1f1ee,roughness:.65});
  const stripeM=new THREE.MeshStandardMaterial({color:0x1447d6,roughness:.65});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.64,.74,.34),[stripeM,stripeM,sideM,sideM,new THREE.MeshStandardMaterial({map:jerseyFront,roughness:.6}),new THREE.MeshStandardMaterial({map:jerseyBack,roughness:.6})]);
  torso.position.y=.38; torso.castShadow=true; hips.add(torso);
  // blue trim shoulders
  hips.add(box(.68,.09,.37,blueMat,0,.74,0));
  // head
  const headG=new THREE.Group(); headG.position.y=.86; hips.add(headG);
  const neck=cyl(.09,.11,.16,skinMat,0,-.02,0); headG.add(neck);
  const head=sph(.21,skinMat,0,.2,.01,20,16); head.scale.set(.92,1.12,1); headG.add(head);
  const hair=sph(.215,hairMat,0,.27,-.025,20,14); hair.scale.set(.94,.82,1); headG.add(hair);
  // face: eyes + brows (front +Z)
  [-.075,.075].forEach(x=>{headG.add(sph(.022,mat(0x1a120a,.3),x,.22,.195,8,8));const brow=box(.07,.016,.012,hairMat,x,.285,.2);headG.add(brow);});
  headG.add(box(.055,.014,.012,skinDark,0,.075,.2)); // mouth, focused
  headG.add(sph(.035,skinMat,0,.15,.205,8,8)); // nose hint
  // ears
  [-.2,.2].forEach(x=>headG.add(sph(.04,skinMat,x,.2,0,8,8)));
  // arms: shoulder pivots
  function arm(side){ // side -1 left(+x model?) use x sign
    const sh=new THREE.Group(); sh.position.set(.38*side,.68,0); hips.add(sh);
    const up=cyl(.085,.075,.36,skinMat,0,-.18,0); sh.add(up);
    const el=new THREE.Group(); el.position.y=-.36; sh.add(el);
    el.add(cyl(.07,.06,.32,skinMat,0,-.16,0));
    const hand=sph(.075,skinMat,0,-.36,0,10,8); el.add(hand);
    return {sh,el,hand};
  }
  const armR=arm(-1), armL=arm(1); // model right = -x when facing +Z? keep labels: R holds gun
  // legs: hip pivots, blue shorts on thigh, skin shin, white shoe. Left leg = +x gets knee brace
  function leg(side,isBrace){
    const hip=new THREE.Group(); hip.position.set(.18*side,0,0); hips.add(hip);
    const thigh=cyl(.115,.095,.42,skinMat,0,-.21,0); hip.add(thigh);
    const shorts=cyl(.16,.15,.34,blueMat,0,-.15,0); hip.add(shorts); // blue shorts over thigh
    // white side stripe on shorts
    hip.add(box(.06,.3,.02,whiteMat,.15*side,-.15,.1));
    const knee=new THREE.Group(); knee.position.y=-.42; hip.add(knee);
    if(isBrace){
      const brace=cyl(.125,.115,.3,greyMat,0,-.06,0); knee.add(brace);
      [-.14,-.05,.04].forEach(y=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(.122,.018,8,18),y===-.05?darkGrey:whiteMat);ring.rotation.x=Math.PI/2;ring.position.y=y;knee.add(ring);});
    }
    knee.add(cyl(.085,.065,.4,skinMat,0,-.22,0));
    knee.add(cyl(.07,.075,.14,whiteMat,0,-.42,0)); // sock
    const shoe=box(.14,.11,.3,whiteMat,0,-.5,.05); knee.add(shoe);
    knee.add(box(.145,.04,.31,mat(0x222222,.7),0,-.555,.05)); // sole
    knee.add(box(.05,.05,.12,blueMat,0,-.46,.12)); // shoe accent
    return {hip,knee};
  }
  const legR=leg(-1,false), legL=leg(1,true);
  // ==== WATER GUN (super soaker) in right hand ====
  const gun=new THREE.Group();
  const gBody=mat(0x00a8e8,.35), gOrange=mat(0xff7b1c,.4), gTank=new THREE.MeshStandardMaterial({color:0x7dd3fc,roughness:.15,transparent:true,opacity:.75});
  gun.add(box(.13,.18,.62,gBody,0,0,.18));
  gun.add(box(.11,.1,.2,gOrange,0,.02,.56)); // nozzle block
  const nozzle=cyl(.035,.045,.14,gOrange,0,.02,.7); nozzle.rotation.x=Math.PI/2; gun.add(nozzle);
  const tank=cyl(.11,.11,.44,gTank,0,.17,.12); tank.rotation.x=Math.PI/2; gun.add(tank);
  gun.add(box(.09,.22,.11,gBody,0,-.16,-.05)); // grip
  gun.add(box(.1,.08,.3,mat(0xffd23a,.4),0,-.11,.3)); // pump
  const tip=new THREE.Object3D(); tip.position.set(0,.02,.8); gun.add(tip);
  gun.position.set(0,-.36,.06); gun.rotation.x=Math.PI/2; // align gun +Z with forearm (-Y in elbow space)
  armR.el.add(gun);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  return {root,hips,headG,armR,armL,legR,legL,gun,tip};
}
const P=buildPlayer(); scene.add(P.root);
// soft shadow blob (helps grounding even if shadow soft)
const blob=new THREE.Mesh(new THREE.CircleGeometry(.55,20),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.22,depthWrite:false})); blob.rotation.x=-Math.PI/2; blob.position.y=.015; scene.add(blob);

// ===== FIRE MONSTERS =====
const _flameMats=[new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xff5500,emissiveIntensity:2,roughness:.3,transparent:true,opacity:.95}),new THREE.MeshStandardMaterial({color:0xffd23a,emissive:0xffaa00,emissiveIntensity:2,roughness:.3,transparent:true,opacity:.9})];
const _flameConeGeo=new THREE.ConeGeometry(.13,.5,7), _flameTopGeo=new THREE.ConeGeometry(.17,.66,7);
function buildMonster(kind){ // 0 imp small, 1 brute big, 2 spitter
  const s=kind===1?1.7:kind===2?1.15:1.0;
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color:kind===2?0xff8c1a:0xf43f1e,roughness:.55,emissive:0xff4400,emissiveIntensity:.9});
  const body=sph(.55,bodyMat,0,.62,0,20,16); body.scale.set(1,.92,1); g.add(body);
  const belly=sph(.36,new THREE.MeshStandardMaterial({color:0xffc93a,emissive:0xff9500,emissiveIntensity:1.1,roughness:.4}),0,.5,.3,16,12); belly.scale.set(1,1,.6); g.add(belly);
  // flame crown: cones
  const flames=[];
  const fMats=_flameMats; // shared across all monsters
  for(let i=0;i<5;i++){const a=i/5*6.28;const f=new THREE.Mesh(_flameConeGeo,fMats[i%2]);f.position.set(Math.cos(a)*.22,1.18,Math.sin(a)*.22);f.rotation.set(Math.sin(a)*.35,0,Math.cos(a)*.35);g.add(f);flames.push(f);}
  const fTop=new THREE.Mesh(_flameTopGeo,fMats[1]);fTop.position.y=1.32;g.add(fTop);flames.push(fTop);
  // eyes angry + mouth
  [-.19,.19].forEach(x=>{const e=sph(.085,mat(0xffffff,.25),x,.78,.46,10,10);g.add(e);g.add(sph(.043,mat(0x1a0a00,.3),x,.77,.53,8,8));const brow=box(.16,.04,.02,mat(0x3a1500,.8),x,.92,.5);brow.rotation.z=x>0?.5:-.5;g.add(brow);});
  const mouth=box(.24,.07,.02,mat(0x3a0d00,.8),0,.5,.52);mouth.rotation.z=.08;g.add(mouth);
  // stub arms with flame hands
  const arms=[];
  [-1,1].forEach(sd=>{const a=new THREE.Group();a.position.set(.52*sd,.7,0);a.add(cyl(.09,.07,.38,bodyMat,0,-.16,0));const fh=new THREE.Mesh(new THREE.ConeGeometry(.11,.3,7),fMats[0]);fh.position.y=-.4;fh.rotation.x=Math.PI;a.add(fh);a.rotation.z=sd*.5;g.add(a);arms.push(a);});
  // little feet coals
  [-.25,.25].forEach(x=>g.add(sph(.14,mat(0x2b1508,.9),x,.09,.1,10,8)));
  if(kind===1){const l=new THREE.PointLight(0xff6600,6,7);l.position.y=1;g.add(l);}
  g.scale.setScalar(s);
  const hpBarBg=new THREE.Mesh(new THREE.PlaneGeometry(.9,.11),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.55,side:THREE.DoubleSide}));
  hpBarBg.position.y=1.85; g.add(hpBarBg);
  const hpBar=new THREE.Mesh(new THREE.PlaneGeometry(.86,.07),new THREE.MeshBasicMaterial({color:0xff5533,side:THREE.DoubleSide}));
  hpBar.position.set(0,1.85,.01); g.add(hpBar);
  return {g,flames,arms,bodyMat,hpBar,s};
}

// ===== particles (single Points pool) =====
const PMAX=900;
const pGeo=new THREE.BufferGeometry();
const pPos=new Float32Array(PMAX*3), pCol=new Float32Array(PMAX*3), pSize=new Float32Array(PMAX);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3).setUsage(THREE.DynamicDrawUsage));
const pTex=canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,2,32,32,30);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);});
const points=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.32,map:pTex,vertexColors:true,transparent:true,depthWrite:false,sizeAttenuation:true}));
points.frustumCulled=false; scene.add(points);
const parts=[]; for(let i=0;i<PMAX;i++){parts.push({life:0,max:1,vx:0,vy:0,vz:0,g:0,r:1,gg:1,b:1});pPos[i*3+1]=-50;}
let pIdx=0; const _pCol=new THREE.Color(); let _pActive=0;
function spawnP(pos,n,color,spd=2.5,life=.6,grav=-4,up=1.8){
  const c=_pCol.set(color);
  for(let k=0;k<n;k++){const idx=pIdx;const p=parts[idx];pIdx=(pIdx+1)%PMAX;p.life=p.max=life*rand(.6,1.2);p.g=grav;p.i=idx;
    pPos[idx*3]=pos.x;pPos[idx*3+1]=pos.y;pPos[idx*3+2]=pos.z;
    p.vx=rand(-spd,spd);p.vy=rand(0,up);p.vz=rand(-spd,spd);p.r=c.r;p.gg=c.g;p.b=c.b;
    pCol[idx*3]=c.r;pCol[idx*3+1]=c.g;pCol[idx*3+2]=c.b;}
}
function updateParts(dt){let any=false;for(const p of parts){if(p.life<=0)continue;any=true;p.life-=dt;const i=p.i;if(i==null)continue;if(p.life<=0){pPos[i*3+1]=-50;continue;}p.vy+=p.g*dt;pPos[i*3]+=p.vx*dt;pPos[i*3+1]+=p.vy*dt;pPos[i*3+2]+=p.vz*dt;if(pPos[i*3+1]<.03){pPos[i*3+1]=.03;p.vy*=-.3;}}if(any){pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;}}

// ===== audio (tiny synth) =====
let AC=null; function ac(){if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC;}
function beep(f,d,type='square',vol=.06,slide=0){try{const a=ac(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=f;if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),a.currentTime+d);g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+d);}catch(e){}}
function noiseHit(d=.18,vol=.12,fc=2500){try{const a=ac(),len=a.sampleRate*d,buf=a.createBuffer(1,len,a.sampleRate),ch=buf.getChannelData(0);for(let i=0;i<len;i++)ch[i]=Math.random()*2-1;const s=a.createBufferSource();s.buffer=buf;const f=a.createBiquadFilter();f.type='highpass';f.frequency.value=fc;const g=a.createGain();g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d);s.connect(f);f.connect(g);g.connect(a.destination);s.start();}catch(e){}}

// ===== game state =====
const S={mode:'title',hp:100,water:100,score:0,kills:0,wave:0,combo:0,comboT:0,weapon:1,shake:0,time:0};
const player={pos:V3(0,0,2),vel:V3(),yaw:Math.PI,vy:0,onGround:true,jumps:0,runPhase:0,speedNow:0,sliding:0,aiming:false,firing:false,fireCd:0,hurtCd:0};
let camYaw=Math.PI, camPitch=-.18; // camera behind player looking toward -? player faces direction of camYaw
const enemies=[], bullets=[], fireballs=[];
// bullet pool meshes
const bulletGeo=new THREE.SphereGeometry(.09,8,8), bulletMat=new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x0284c7,emissiveIntensity:1.2,roughness:.1,transparent:true,opacity:.9});
const fireGeo=new THREE.SphereGeometry(.18,10,10), fireMat=new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xff4400,emissiveIntensity:2.2,roughness:.3});
// mesh pools: avoid alloc/GC churn at ~18 shots/sec
const _bPool=[], _fPool=[];
function _getMesh(pool,geo,mat){const m=pool.pop()||new THREE.Mesh(geo,mat);scene.add(m);return m;}
function _freeMesh(pool,m){scene.remove(m);pool.push(m);}

// ===== input =====
const keys={}; let mouseDown=false, rmb=false, locked=false;
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'){e.preventDefault();tryJump();}if(e.code==='Digit1')setWeapon(1);if(e.code==='Digit2')setWeapon(2);if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault?.();});
addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('mousedown',e=>{if(e.button===0)mouseDown=true;if(e.button===2)rmb=true;});
addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;if(e.button===2)rmb=false;});
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===canvas);
let dragging=false,lastMX=0,lastMY=0;
canvas.addEventListener('pointerdown',e=>{dragging=true;lastMX=e.clientX;lastMY=e.clientY;});
addEventListener('pointerup',()=>dragging=false);
addEventListener('mousemove',e=>{
  if(S.mode!=='play')return;
  if(locked){camYaw-=e.movementX*.0026;camPitch-=e.movementY*.0026;}
  else if(dragging){camYaw-=(e.clientX-lastMX)*.006;camPitch-=(e.clientY-lastMY)*.006;lastMX=e.clientX;lastMY=e.clientY;}
  camPitch=clamp(camPitch,-1.1,.75);
});
// touch joystick
let joyVec={x:0,y:0}, touchFire=false, touchAim=false;
const joy=$('joy'), joyStick=$('joyStick');
let joyId=null, lookId=null, lookLast={x:0,y:0};
canvas.addEventListener('touchstart',e=>{for(const t of e.changedTouches){if(t.clientX>innerWidth*.45&&lookId===null){lookId=t.identifier;lookLast={x:t.clientX,y:t.clientY};}}},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches){if(t.identifier===lookId){camYaw-=(t.clientX-lookLast.x)*.008;camPitch=clamp(camPitch-(t.clientY-lookLast.y)*.008,-1.1,.75);lookLast={x:t.clientX,y:t.clientY};}}},{passive:false});
canvas.addEventListener('touchend',e=>{for(const t of e.changedTouches)if(t.identifier===lookId)lookId=null;});
if(joy){joy.addEventListener('touchstart',e=>{joyId=e.changedTouches[0].identifier;},{passive:true});
joy.addEventListener('touchmove',e=>{const t=[...e.changedTouches].find(t=>t.identifier===joyId);if(!t)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(t.clientX-cx)/38,dy=(t.clientY-cy)/38;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}joyVec={x:dx,y:dy};joyStick.style.transform=`translate(calc(-50% + ${dx*30}px),calc(-50% + ${dy*30}px))`;},{passive:true});
joy.addEventListener('touchend',()=>{joyVec={x:0,y:0};joyStick.style.transform='translate(-50%,-50%)';});}
$('btnJump')?.addEventListener('touchstart',e=>{e.preventDefault();tryJump();});
$('btnFire')?.addEventListener('touchstart',e=>{e.preventDefault();touchFire=true;});
$('btnFire')?.addEventListener('touchend',()=>touchFire=false);
$('btnAim')?.addEventListener('touchstart',e=>{e.preventDefault();touchAim=!touchAim;});
function setWeapon(w){S.weapon=w;document.querySelectorAll('.slot').forEach((el,i)=>el.classList.toggle('on',i===w-1));$('ammo').innerHTML=w===1?'∞ <small>/ STREAM</small>':'◉◉◉ <small>/ BURST</small>';beep(w===1?500:350,.08,'square',.05);}
function tryJump(){if(S.mode!=='play')return;if(player.onGround){player.vy=8.2;player.onGround=false;player.jumps=1;beep(300,.1,'sine',.05,200);}else if(player.jumps<2){player.vy=7.4;player.jumps=2;spawnP(player.pos.clone().add(V3(0,.2,0)),10,0xffffff,1.5,.4,-1,1);beep(420,.1,'sine',.05,200);}}

// ===== waves / enemies =====
function showBanner(t,s){$('bannerTitle').textContent=t;$('bannerSub').textContent=s;$('banner').classList.remove('hidden');setTimeout(()=>$('banner').classList.add('hidden'),2200);}
function feed(txt){const d=document.createElement('div');d.textContent=txt;$('killFeed').prepend(d);setTimeout(()=>d.remove(),2600);while($('killFeed').children.length>4)$('killFeed').lastChild.remove();}
function spawnWave(n){
  S.wave=n; $('wavePill').textContent='WAVE '+n;
  const count=4+n*2;
  showBanner('WAVE '+n, n===1?'Fire imps inbound — soak them!':n%3===0?'Brutes + spitters! Stay moving.':'They are getting hotter…');
  beep(180,.25,'sawtooth',.07,-80); setTimeout(()=>beep(240,.2,'sawtooth',.06,-60),200);
  for(let i=0;i<count;i++){
    setTimeout(()=>{ if(S.mode!=='play')return;
      const kind=(n>=2&&i%5===4)?1:(n>=3&&i%4===2)?2:0;
      const m=buildMonster(kind);
      const side=Math.random();
      let x,z; if(side<.5){x=rand(-44,44);z=rand(-40,-34);}else if(side<.75){x=-46;z=rand(-28,10);}else{x=46;z=rand(-28,10);}
      m.g.position.set(x,0,z); scene.add(m.g);
      const baseHp=kind===1?130:kind===2?55:34;
      enemies.push({...m,kind,pos:m.g.position,hp:baseHp*(1+(n-1)*.12),maxHp:baseHp*(1+(n-1)*.12),speed:kind===1?2.1:kind===2?2.7:3.6,atkCd:0,shootCd:rand(1,2.4),phase:rand(0,6),wet:0});
      spawnP(m.g.position.clone().add(V3(0,.6,0)),14,0xff7700,2,.6,1,2.5);
    }, i*550);
  }
}
function damageEnemy(e,dmg,hitPos){
  e.hp-=dmg; e.wet=1;
  spawnP(hitPos,7,0x7dd3fc,2.2,.45,-5,2); spawnP(hitPos,5,0xffffff,1.2,.7,1.5,2); // splash + steam
  $('hitmark').style.opacity=1; $('hitmark').style.transform='translate(-50%,-50%) scale(1.25)'; setTimeout(()=>{$('hitmark').style.opacity=0;$('hitmark').style.transform='translate(-50%,-50%) scale(1)';},70);
  noiseHit(.09,.05,3000);
  if(e.hp<=0&&!e.dead){ e.dead=true; S.kills++; S.combo++; S.comboT=2.2; const pts=(e.kind===1?250:e.kind===2?150:100)*Math.max(1,S.combo); S.score+=pts;
    feed(`💦 Soaked ${e.kind===1?'BRUTE':e.kind===2?'SPITTER':'imp'} +${pts}`);
    spawnP(e.pos.clone().add(V3(0,.8,0)),34,0xffffff,3.2,.9,1,3.5); spawnP(e.pos.clone().add(V3(0,.8,0)),18,0x38bdf8,3,.7,-4,3);
    beep(600,.18,'sine',.07,500); noiseHit(.3,.14,1200);
    scene.remove(e.g);
  }
}
function hurtPlayer(dmg){
  if(player.hurtCd>0||S.mode!=='play')return; player.hurtCd=.45; S.hp-=dmg; S.shake=.45; S.combo=0;
  $('dmgVig').style.boxShadow='inset 0 0 120px 45px rgba(255,40,0,.55)'; setTimeout(()=>$('dmgVig').style.boxShadow='inset 0 0 120px 40px rgba(255,40,0,0)',180);
  beep(140,.2,'sawtooth',.09,-60);
  if(S.hp<=0){S.hp=0; gameOver(false);}
}
function gameOver(won){
  S.mode='end'; document.exitPointerLock?.();
  $('endTitle').textContent=won?'BEACH SAVED! 🏆':'WIPED OUT! 🌊';
  $('endSub').textContent=won?'Every fire monster soaked. Ateneo #2 does it again.':'The fire monsters got you. Shake off the sand and run it back.';
  $('stScore').textContent=S.score; $('stWave').textContent=S.wave; $('stKills').textContent=S.kills;
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden');
}
function startGame(){
  // clear
  enemies.forEach(e=>scene.remove(e.g)); enemies.length=0;
  bullets.forEach(b=>_freeMesh(_bPool,b.m)); bullets.length=0; fireballs.forEach(b=>_freeMesh(_fPool,b.m)); fireballs.length=0;
  Object.assign(S,{mode:'play',hp:100,water:100,score:0,kills:0,wave:0,combo:0});
  player.pos.set(0,0,4); player.vel.set(0,0,0); player.vy=0; camYaw=Math.PI; camPitch=-.16; P.root.rotation.y=Math.PI; camera.position.set(1.2,2.4,10);
  $('title').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  try{canvas.requestPointerLock?.();}catch(e){}
  ac(); spawnWave(1);
}
$('playBtn').addEventListener('click',startGame);
$('againBtn').addEventListener('click',startGame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

// ===== shooting =====
const _tip=new THREE.Vector3(), _dir=new THREE.Vector3(), _target=new THREE.Vector3();
const _v1=new THREE.Vector3(), _v2=new THREE.Vector3(), _v3=new THREE.Vector3(); let _frame=0;
const _UP=new THREE.Vector3(0,1,0), _desired=new THREE.Vector3(), _look=new THREE.Vector3();
const EL={hpBar:$('hpBar'),hpTxt:$('hpTxt'),waterBar:$('waterBar'),waterTxt:$('waterTxt'),score:$('score'),combo:$('combo'),left:$('enemiesLeft'),hint:$('hint')};
let _hudFrame=-9, _ftAcc=0, _ftN=0;
function shoot(dt){
  player.fireCd-=dt;
  const firing=(mouseDown||touchFire)&&S.mode==='play';
  player.firing=firing;
  if(!firing||player.fireCd>0)return;
  if(S.water<=0){player.fireCd=.25;beep(900,.06,'square',.04);$('hint').classList.add('show');return;}
  // aim: converge bullets to a point far along the camera (crosshair) ray
  camera.getWorldDirection(_dir);
  P.tip.getWorldPosition(_tip);
  _target.copy(camera.position).addScaledVector(_dir,42);
  _dir.copy(_target).sub(_tip).normalize();
  if(S.weapon===1){
    player.fireCd=.055; S.water=Math.max(0,S.water-1.1);
    const m=_getMesh(_bPool,bulletGeo,bulletMat); m.scale.setScalar(1); m.position.copy(_tip);
    const spread=player.aiming?.012:.035;
    const v=_dir.clone(); v.x+=rand(-spread,spread);v.y+=rand(-spread,spread);v.z+=rand(-spread,spread);v.normalize().multiplyScalar(46);
    bullets.push({m,v,life:1.35,dmg:7,r:.16});
    spawnP(_tip,2,0x7dd3fc,1,.25,-2,.5);
    if(Math.random()<.35)noiseHit(.07,.035,3500);
  }else{
    player.fireCd=.42; S.water=Math.max(0,S.water-7); S.shake=Math.max(S.shake,.12);
    for(let i=0;i<5;i++){const m=_getMesh(_bPool,bulletGeo,bulletMat);m.scale.setScalar(1.9);m.position.copy(_tip);
      const v=_dir.clone();v.x+=rand(-.07,.07);v.y+=rand(-.05,.07);v.z+=rand(-.07,.07);v.normalize().multiplyScalar(30);
      bullets.push({m,v,life:1.1,dmg:16,r:.3});}
    noiseHit(.16,.1,1800); beep(220,.1,'sine',.05,-100);
  }
}

// ===== main loop =====
const clock=new THREE.Clock();
let waveClearT=0, spawnPending=false;
function forwardVec(){return V3(Math.sin(camYaw),0,Math.cos(camYaw));} // camera looks along -? we define player forward = this
// NOTE: camYaw convention: camera positioned at player - forward*dist, looking at player+forward. forward = (sin,0,cos)
function animate(){
  requestAnimationFrame(animate);
  try{
  const dt=Math.min(clock.getDelta(),.05); S.time+=dt; const t=S.time;
  // ocean waves
  const op=ocean.geometry.attributes.position;
  for(let i=0;i<op.count;i++){const x=oceanBase[i*3],y=oceanBase[i*3+1];op.setZ(i,Math.sin(x*.18+t*1.6)*.18+Math.cos(y*.22+t*1.2)*.14);}
  op.needsUpdate=true; // normals left as-is: flat-lit water, skips a full recompute every frame
  foams.forEach((f,i)=>{f.position.z=17.2+i*2.1+Math.sin(t*1.1+i)*0.9;f.material.opacity=.5+Math.sin(t*1.1+i)*.25;});
  clouds.forEach((c,i)=>{c.position.x+=dt*(.4+i*.07); if(c.position.x>110)c.position.x=-110;});
  updateParts(dt);

  if(S.mode==='title'||S.mode==='end'){
    // cinematic orbit around player at spawn
    P.root.position.copy(player.pos); P.root.rotation.y=Math.atan2(Math.sin(t*.25),Math.cos(t*.25))+Math.PI;
    // idle pose: hold gun up like holding ball pose-ish
    P.armR.sh.rotation.x=-.9+Math.sin(t*1.4)*.05; P.armR.el.rotation.x=-.35;
    P.armL.sh.rotation.x=-.7; P.armL.el.rotation.x=-.7;
    P.hips.position.y=.98+Math.sin(t*1.6)*.02;
    const a=.65+Math.sin(t*.18)*.35; camera.position.set(player.pos.x+Math.sin(a)*4.6,1.75,player.pos.z+Math.cos(a)*4.6);
    P.root.rotation.y=a-.55; // 3/4 front view for the title hero shot
    const _r=V3(Math.cos(a),0,-Math.sin(a)); const off=1.5*Math.min(1,camera.aspect/1.3);
    camera.lookAt(player.pos.x-_r.x*off,1.02,player.pos.z-_r.z*off); camera.fov=55; camera.updateProjectionMatrix();
    blob.position.set(player.pos.x,.015,player.pos.z);
    renderer.render(scene,camera); return;
  }

  // --- movement input (Fortnite-ish) ---
  let ix=0,iz=0;
  if(keys.KeyW||keys.ArrowUp)iz+=1; if(keys.KeyS||keys.ArrowDown)iz-=1; if(keys.KeyA||keys.ArrowLeft)ix-=1; if(keys.KeyD||keys.ArrowRight)ix+=1;
  ix+=joyVec.x; iz-=joyVec.y;
  const len=Math.hypot(ix,iz); if(len>1){ix/=len;iz/=len;}
  const sprint=(keys.ShiftLeft||keys.ShiftRight)&&iz>0.1;
  const crouch=keys.ControlLeft||keys.ControlRight||keys.KeyC;
  player.aiming=rmb||touchAim;
  // slide: crouch while sprinting & grounded
  if(crouch&&sprint&&player.onGround&&player.sliding<=0&&player.speedNow>6){player.sliding=.65; spawnP(player.pos.clone().add(V3(0,.15,0)),12,0xf0d488,2,.5,-3,1); beep(200,.15,'sine',.04,-80);}
  if(player.sliding>0)player.sliding-=dt;
  let maxSpeed=player.aiming?3.4:crouch&&player.sliding<=0?2.6:sprint?9.2:5.6;
  if(player.sliding>0)maxSpeed=11;
  const fwd=forwardVec();
  const rightV=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize();
  const wish=V3(0,0,0).addScaledVector(fwd,iz).addScaledVector(rightV,ix);
  if(wish.lengthSq()>0)wish.normalize();
  const accel=player.onGround?28:8;
  player.vel.x+= (wish.x*maxSpeed-player.vel.x)*Math.min(1,accel*dt/Math.max(1,maxSpeed)*3);
  player.vel.z+= (wish.z*maxSpeed-player.vel.z)*Math.min(1,accel*dt/Math.max(1,maxSpeed)*3);
  if(player.sliding>0){player.vel.x+=fwd.x*18*dt; player.vel.z+=fwd.z*18*dt;}
  // gravity / jump
  player.vy-=22*dt; player.pos.y+=player.vy*dt;
  if(player.pos.y<=0){if(!player.onGround&&player.vy<-6)spawnP(player.pos.clone().add(V3(0,.1,0)),8,0xf0d488,1.6,.4,-3,1);player.pos.y=0;player.vy=0;player.onGround=true;player.jumps=0;}
  player.pos.x+=player.vel.x*dt; player.pos.z+=player.vel.z*dt;
  player.pos.x=clamp(player.pos.x,-52,52); player.pos.z=clamp(player.pos.z,-40,26);
  // colliders push-out
  for(const c of colliders){const dx=player.pos.x-c.x,dz=player.pos.z-c.z,d=Math.hypot(dx,dz);if(d<c.r+.45&&d>0.001){player.pos.x=c.x+dx/d*(c.r+.45);player.pos.z=c.z+dz/d*(c.r+.45);}}
  player.speedNow=Math.hypot(player.vel.x,player.vel.z);
  // player facing: aim/fire/move -> face camYaw forward; else face move dir
  let targetYaw;
  if(player.aiming||mouseDown||touchFire) targetYaw=Math.atan2(fwd.x,fwd.z);
  else if(player.speedNow>.6) targetYaw=Math.atan2(player.vel.x,player.vel.z);
  else targetYaw=P.root.rotation.y;
  let dy=targetYaw-P.root.rotation.y; while(dy>Math.PI)dy-=Math.PI*2; while(dy<-Math.PI)dy+=Math.PI*2;
  P.root.rotation.y+=dy*Math.min(1,dt*14);
  P.root.position.copy(player.pos);
  blob.position.set(player.pos.x,.015,player.pos.z); blob.material.opacity=clamp(.28-player.pos.y*.04,.06,.28);
  // run animation
  player.runPhase+=dt*(3+player.speedNow*1.55);
  const rp=player.runPhase, amp=clamp(player.speedNow/8,0,1);
  const crouchAmt=(crouch||player.sliding>0)?.32:0;
  P.hips.position.y=.98-crouchAmt+ (player.onGround?Math.abs(Math.sin(rp))*.07*amp:0.04);
  P.hips.rotation.x=player.sliding>0?-.55:amp*.12;
  if(!player.onGround){P.legR.hip.rotation.x=-.5;P.legR.knee.rotation.x=.7;P.legL.hip.rotation.x=.35;P.legL.knee.rotation.x=.25;}
  else{P.legR.hip.rotation.x=Math.sin(rp)*.95*amp;P.legL.hip.rotation.x=Math.sin(rp+Math.PI)*.95*amp;
       P.legR.knee.rotation.x=Math.max(0,-Math.sin(rp))*.9*amp+.05;P.legL.knee.rotation.x=Math.max(0,-Math.sin(rp+Math.PI))*.9*amp+.05;}
  // arms: right aims gun forward (pitch with camera), left supports / swings
  if(player.aiming||player.firing||mouseDown){
    P.armR.sh.rotation.x=-Math.PI/2 - camPitch*.9; P.armR.sh.rotation.z=.12; P.armR.el.rotation.x=-.12;
    P.armL.sh.rotation.x=-Math.PI/2 - camPitch*.9 + .25; P.armL.sh.rotation.z=-.55; P.armL.el.rotation.x=-.85;
    P.gun.rotation.x=Math.PI/2; P.gun.position.set(0,-.36,.02);
  }else{
    P.armR.sh.rotation.x=Math.sin(rp+Math.PI)*.8*amp-.25; P.armR.sh.rotation.z=.08; P.armR.el.rotation.x=-.55;
    P.armL.sh.rotation.x=Math.sin(rp)*.8*amp; P.armL.sh.rotation.z=-.08; P.armL.el.rotation.x=-.3-Math.max(0,Math.sin(rp))*.3*amp;
    P.gun.rotation.x=Math.PI/2-.45; P.gun.position.set(0,-.36,.02);
  }
  P.headG.rotation.x=camPitch*.35;
  // refill
  const inOcean=player.pos.z>15.5;
  const nearRefill=inOcean||refillSpots.some(s=>Math.hypot(player.pos.x-s.x,player.pos.z-s.z)<s.r);
  if(inOcean){S.water=Math.min(100,S.water+38*dt); if(Math.random()<.2)spawnP(player.pos.clone().add(V3(rand(-.4,.4),.15,rand(-.4,.4))),2,0x7dd3fc,1,.4,-3,1.4);}
  if(keys.KeyR&&nearRefill&&S.water<100){S.water=Math.min(100,S.water+70*dt); spawnP(player.pos.clone().add(V3(0,1.2,0)),3,0x38bdf8,1.4,.4,-4,1);}
  EL.hint.classList.toggle('show',S.water<28);
  // slow hp regen after no hurt
  player.hurtCd-=dt; if(player.hurtCd<-4&&S.hp<100)S.hp=Math.min(100,S.hp+4*dt);
  shoot(dt);

  // --- bullets ---
  _frame++;
  for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;b.v.y-=3.5*dt;b.m.position.addScaledVector(b.v,dt);
    let dead=b.life<=0||b.m.position.y<0;
    if(b.m.position.y<.05&&!dead){spawnP(b.m.position,4,0x7dd3fc,1.4,.35,-4,1.4);dead=true;}
    if((_frame+i)%3===0)spawnP(b.m.position,1,0x7dd3fc,.25,.22,-1,.3); // trail at 1/3 rate
    if(!dead)for(const e of enemies){if(e.dead)continue;const dx=b.m.position.x-e.pos.x,dy=b.m.position.y-(e.pos.y+.7*e.s),dz=b.m.position.z-e.pos.z,rr=.8*e.s+b.r; if(dx*dx+dy*dy+dz*dz<rr*rr){damageEnemy(e,b.dmg,b.m.position);dead=true;break;}}
    if(dead){_freeMesh(_bPool,b.m);bullets.splice(i,1);}}
  // --- fireballs ---
  for(let i=fireballs.length-1;i>=0;i--){const b=fireballs[i];b.life-=dt;b.m.position.addScaledVector(b.v,dt);if((_frame+i)%2===0)spawnP(b.m.position,1,0xff8800,.4,.3,1,1);
    let dead=b.life<=0||b.m.position.y<0;
    _v1.copy(player.pos);_v1.y+=1.1; if(b.m.position.distanceToSquared(_v1)<.56){hurtPlayer(11);spawnP(b.m.position,10,0xff6600,2,.4,-2,2);dead=true;}
    if(dead){_freeMesh(_fPool,b.m);fireballs.splice(i,1);}}
  // --- enemies AI ---
  let alive=0;
  for(const e of enemies){ if(e.dead)continue; alive++;
    e.phase+=dt*6; e.wet=Math.max(0,e.wet-dt*1.2); e.atkCd-=dt; e.shootCd-=dt;
    _v1.copy(player.pos).sub(e.pos); _v1.y=0; const dist=_v1.length(); const dir=_v1.normalize();
    const stopAt=e.kind===2?11:1.35*e.s;
    if(dist>stopAt){e.pos.addScaledVector(dir,e.speed*(dist>25?1.7:1)*(1-e.wet*.35)*dt);} // catch-up speed so stragglers always reach the fight
    // separation (alloc-free)
    for(const o of enemies){if(o===e||o.dead)continue;_v2.copy(e.pos).sub(o.pos);_v2.y=0;const d2=_v2.lengthSq();if(d2<1.44&&d2>0.0001){const d=Math.sqrt(d2);e.pos.addScaledVector(_v2.normalize(),(1.2-d)*dt*2);}}
    e.pos.x=clamp(e.pos.x,-53,53); e.pos.z=clamp(e.pos.z,-41,20);
    e.g.rotation.y=Math.atan2(dir.x,dir.z);
    e.g.position.y=Math.abs(Math.sin(e.phase))*.14;
    e.g.scale.setScalar(e.s*(1+Math.sin(e.phase*2)*.03)*(0.75+0.25*(e.hp/e.maxHp)+0.0));
    e.flames.forEach((f,fi)=>{const sc=(1+Math.sin(t*11+fi*1.7)*.28)*(0.35+0.65*(e.hp/e.maxHp))*(1-e.wet*.4);f.scale.set(sc,sc*(1+Math.sin(t*13+fi)*.2),sc);});
    e.arms.forEach((a,ai)=>a.rotation.x=Math.sin(e.phase+ai*Math.PI)*.6-.4);
    e.bodyMat.emissiveIntensity=.45+.75*(e.hp/e.maxHp);
    e.hpBar.scale.x=Math.max(0,e.hp/e.maxHp); e.hpBar.position.x=-(1-Math.max(0,e.hp/e.maxHp))*.43; // bars face +Z local; monster faces player, so bars face camera
    if(Math.random()<.18){_v3.set(e.pos.x+rand(-.3,.3),e.pos.y+1.3*e.s,e.pos.z+rand(-.3,.3));spawnP(_v3,1,0xff9500,.5,.5,2.5,1.5);}
    // attacks
    if(dist<1.7*e.s&&e.atkCd<=0){e.atkCd=.85;hurtPlayer(e.kind===1?16:9); spawnP(player.pos.clone().add(V3(0,1.1,0)),12,0xff6600,2,.45,-2,2);}
    if(e.kind===2&&dist<26&&dist>4&&e.shootCd<=0){e.shootCd=rand(1.6,2.6);
      const m=_getMesh(_fPool,fireGeo,fireMat); const from=e.pos.clone();from.y+=1.0*e.s;m.position.copy(from);
      const tgt=player.pos.clone();tgt.y+=1.1; const v=tgt.sub(from).normalize().multiplyScalar(13); fireballs.push({m,v,life:3});
      beep(320,.14,'sawtooth',.035,-160);}
  }
  // wave clear?
  const expectedAlive=alive; // counted in the AI pass above; HUD text updated in the throttled HUD block
  // cleanup dead refs periodically
  for(let i=enemies.length-1;i>=0;i--)if(enemies[i].dead)enemies.splice(i,1);
  if(expectedAlive===0&&S.mode==='play'){
    waveClearT+=dt;
    if(waveClearT>1.6){ waveClearT=0;
      if(S.wave>=5){gameOver(true);}
      else {S.hp=Math.min(100,S.hp+18); S.water=Math.min(100,S.water+35); showBanner('WAVE CLEAR! +❤','Next wave incoming…'); setTimeout(()=>{if(S.mode==='play')spawnWave(S.wave+1);},1400); S.wave=S.wave; // spawnWave increments via arg; guard double
        // prevent re-entry: push a dummy timer enemy? use waveClearT negative lock
        waveClearT=-3;
      }
    }
  } else waveClearT=Math.min(waveClearT,0);

  // combo
  if(S.comboT>0){S.comboT-=dt;if(S.comboT<=0)S.combo=0;}

  // --- camera (third person, Fortnite shoulder) --- (alloc-free temps)
  const aimDist=player.aiming?2.6:5.2, aimSide=player.aiming?1.05:.85, aimH=player.aiming?1.75:2.05;
  const fwdCam=_v1.set(Math.sin(camYaw)*Math.cos(camPitch),Math.sin(camPitch),Math.cos(camYaw)*Math.cos(camPitch));
  const rightCam=_v2.crossVectors(fwdCam,_UP).normalize();
  const target=_v3.copy(player.pos); target.y+=aimH-crouchAmt*.6;
  _desired.copy(target).addScaledVector(fwdCam,-aimDist).addScaledVector(rightCam,aimSide);
  _desired.y=Math.max(.55,_desired.y);
  camera.position.lerp(_desired,Math.min(1,dt*18));
  if(S.shake>0){S.shake-=dt;camera.position.x+=rand(-1,1)*S.shake*.18;camera.position.y+=rand(-1,1)*S.shake*.18;}
  _look.copy(target).addScaledVector(fwdCam,9);
  camera.lookAt(_look);
  const targetFov=player.aiming?52:sprint&&player.speedNow>6?76:68;
  if(Math.abs(camera.fov-targetFov)>.05){camera.fov=lerp(camera.fov,targetFov,Math.min(1,dt*8)); camera.updateProjectionMatrix();}

  // HUD at ~12Hz: DOM writes are not free at 60fps
  if(_frame-_hudFrame>=5){_hudFrame=_frame;
    EL.combo.textContent=S.combo>1?('COMBO ×'+S.combo+' 🔥➜💦'):'';
    EL.hpBar.style.width=S.hp+'%'; EL.hpTxt.textContent=Math.ceil(S.hp);
    EL.waterBar.style.width=S.water+'%'; EL.waterTxt.textContent=Math.ceil(S.water)+'%';
    EL.score.textContent=S.score.toLocaleString();
    EL.left.textContent='🔥 '+expectedAlive+' left';
  }

  // adaptive resolution: if sustained frame time is slow, step pixel ratio down (and back up when fast)
  _ftAcc+=dt; _ftN++;
  if(_ftAcc>=2){const avgFps=_ftN/_ftAcc; _ftAcc=0;_ftN=0;
    if(avgFps<45&&_pxRatio>1){_pxRatio=Math.max(1,_pxRatio-.25);renderer.setPixelRatio(_pxRatio);}
    else if(avgFps>57&&_pxRatio<Math.min(devicePixelRatio,1.5)){_pxRatio=Math.min(Math.min(devicePixelRatio,1.5),_pxRatio+.25);renderer.setPixelRatio(_pxRatio);}}

  renderer.render(scene,camera);
  }catch(err){ $('err').textContent='⚠ '+err.message; console.error(err); }
}
animate();



