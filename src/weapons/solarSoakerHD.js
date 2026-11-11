import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Metres. Grip datum is (0,0,0), muzzle is -Z, +Y is up.
// Geometry is baked once into ten material batches, including the sight glass.
export function buildSolarSoakerHD({ textureBase = new URL('../../assets/weapons/solar-soaker/', import.meta.url).href } = {}) {
  const group = new THREE.Group();
  group.name = 'Solar Soaker HD';
  const batches = new Map();
  const loader = new THREE.TextureLoader();
  const base = String(textureBase).replace(/\/?$/, '/');
  const resources = [];
  function load(name) {
    const texture = loader.load(base + name, () => {}, undefined, () => {});
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    resources.push(texture);
    return texture;
  }
  // A loading manager supplies an explicit promise for callers wanting a fully textured first frame.
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  loader.manager = new THREE.LoadingManager(readyResolve, undefined, url => readyReject(new Error(`Weapon texture failed: ${url}`)));
  const paintNormal = load('paint-normal.webp');
  const paintGrain=load('paint-grain.webp');paintGrain.colorSpace=THREE.SRGBColorSpace;paintGrain.repeat.set(4,4);
  const paintRough = load('paint-roughness.webp');
  const steelNormal = load('steel-normal.webp');
  const steelRough = load('steel-roughness.webp');
  steelNormal.repeat.set(5,5); steelRough.repeat.set(3,3);
  paintNormal.repeat.set(3,3);paintRough.repeat.set(2,2);
  for(const texture of [paintNormal,paintRough,steelNormal,steelRough])texture.channel=1;

  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = 2048;
  const ac = atlas.getContext('2d');
  ac.fillStyle = '#bd8e3f'; ac.fillRect(0, 0, 2048, 2048);
  const metalAtlas = document.createElement('canvas');
  metalAtlas.width = metalAtlas.height = 2048;
  const mc = metalAtlas.getContext('2d');
  mc.fillStyle = '#151515'; mc.fillRect(0, 0, 2048, 2048);
  let tileCount = 0;
  const hash = (x, y, seed = 0) => {
    let n = Math.imul(x + seed * 73, 374761393) ^ Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const distSegment = (x,y,a,b) => {
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=THREE.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
    const sx=x-a[0]-t*dx,sy=y-a[1]-t*dy;
    return sx*sx+sy*sy;
  };
  // Curvature bake: distance to the real outer contour and every cut-out, in metres.
  // Noise only breaks up that edge mask; it never places random chips on panel interiors.
  function paintTile(outline, holes = []) {
    if (tileCount >= 16) throw new Error('Paint atlas exhausted');
    const id = tileCount++, size = 512, pad = 12;
    const xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]);
    const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY;
    const image=ac.createImageData(size,size), metallic=mc.createImageData(size,size);
    const contours=[outline,...holes];
    const segments=contours.flatMap(c=>c.map((p,i)=>[p,c[(i+1)%c.length]]));
    for(let py=0;py<size;py++) for(let px=0;px<size;px++) {
      const x=minX+(px-pad)/(size-2*pad)*w,y=minY+(py-pad)/(size-2*pad)*h;
      let d=1e18;
      for(const [a,b] of segments) d=Math.min(d,distSegment(x,y,a,b));
      d=Math.sqrt(d);
      const n=hash(px,py,id), coarse=hash(Math.floor(px/5),Math.floor(py/5),id+11);
      const cluster=hash(Math.floor(px/21),Math.floor(py/21),id+97);
      const edge=d < (.00015+coarse*.0014+Math.pow(cluster,12)*.012) && coarse>.40 && n>.20;
      const primer=!edge && d<(.0004+coarse*.0019) && coarse>.42 && n>.28;
      const dust=Math.exp(-d/.0028)*(.2+.3*n);
      const variation=(n-.5)*9+(coarse-.5)*6;
      const rgb=edge ? [89+62*n,87+58*n,79+51*n] : primer ? [179+28*n,166+24*n,132+24*n] : [194+variation,145+variation,70+variation];
      const k=(py*size+px)*4;
      for(let c=0;c<3;c++) image.data[k+c]=rgb[c]*(1-dust*.25)+[194,169,124][c]*dust*.25;
      image.data[k+3]=255;
      metallic.data[k]=metallic.data[k+1]=metallic.data[k+2]=edge?220:18;
      metallic.data[k+3]=255;
    }
    const tx=(id%4)*size,ty=Math.floor(id/4)*size;
    ac.putImageData(image,tx,ty); mc.putImageData(metallic,tx,ty);
    return { id,minX,minY,w,h,tx,ty,pad,size };
  }
  const paintMap=new THREE.CanvasTexture(atlas); paintMap.colorSpace=THREE.SRGBColorSpace;
  const paintMetal=new THREE.CanvasTexture(metalAtlas);
  paintMap.anisotropy=paintMetal.anisotropy=8;
  resources.push(paintMap,paintMetal);
  const paint=new THREE.MeshStandardMaterial({map:paintMap,metalness:1,metalnessMap:paintMetal,roughness:.78,roughnessMap:paintRough,normalMap:paintNormal,normalScale:new THREE.Vector2(.13,.13)});
  paint.onBeforeCompile=shader=>{
    shader.uniforms.paintGrain={value:paintGrain};
    shader.fragmentShader='uniform sampler2D paintGrain;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 grain=texture2D(paintGrain,vNormalMapUv).rgb;
      float grainLum=dot(grain,vec3(.299,.587,.114));
      diffuseColor.rgb*=.90+grainLum*.25;`);
  };
  paint.customProgramCacheKey=()=> 'solar-soaker-grain-v1';
  const steel=new THREE.MeshStandardMaterial({color:0x938c7b,metalness:.94,roughness:.70,roughnessMap:steelRough,normalMap:steelNormal,normalScale:new THREE.Vector2(.09,.09),vertexColors:true});
  const dark=new THREE.MeshStandardMaterial({color:0x37383a,metalness:.75,roughness:.64,normalMap:steelNormal,normalScale:new THREE.Vector2(.08,.08),vertexColors:true});
  const rubberCanvas=document.createElement('canvas');rubberCanvas.width=rubberCanvas.height=512;
  const rc=rubberCanvas.getContext('2d'); const rd=rc.createImageData(512,512);
  for(let y=0;y<512;y++) for(let x=0;x<512;x++) {const i=(y*512+x)*4,n=hash(x,y,47),v=190+Math.pow(n,3)*65;rd.data[i]=rd.data[i+1]=rd.data[i+2]=v;rd.data[i+3]=255;}
  rc.putImageData(rd,0,0);
  for(let y=4;y<512;y+=8)for(let x=4;x<512;x+=8){const dx=x+(hash(x,y,5)-.5)*3,dy=y+(hash(x,y,6)-.5)*3;rc.fillStyle='rgba(55,52,47,.27)';rc.beginPath();rc.arc(dx,dy,2.4+hash(x,y,7),0,Math.PI*2);rc.fill();rc.strokeStyle='rgba(255,255,255,.18)';rc.lineWidth=.7;rc.stroke();}
  const stipple=new THREE.CanvasTexture(rubberCanvas);stipple.wrapS=stipple.wrapT=THREE.RepeatWrapping;
  stipple.repeat.set(3,3);stipple.channel=1;resources.push(stipple);
  const rubber=new THREE.MeshStandardMaterial({color:0x454443,map:stipple,roughness:.86,bumpMap:stipple,bumpScale:.0008,vertexColors:true});
  const ceramicCanvas=document.createElement('canvas');ceramicCanvas.width=ceramicCanvas.height=512;
  const cc=ceramicCanvas.getContext('2d');cc.fillStyle='#f0e7d2';cc.fillRect(0,0,512,512);
  const nodes=[];for(let y=0;y<12;y++){nodes[y]=[];for(let x=0;x<12;x++)nodes[y][x]=[x*48+(hash(x,y,31)-.5)*31,y*48+(hash(x,y,41)-.5)*31];}
  cc.lineWidth=.7;cc.strokeStyle='rgba(83,62,38,.27)';
  for(let y=0;y<11;y++)for(let x=0;x<11;x++){const p=nodes[y][x];for(const q of [nodes[y][x+1],nodes[y+1][x]]){cc.beginPath();cc.moveTo(...p);cc.lineTo((p[0]+q[0])/2+3,(p[1]+q[1])/2-2);cc.lineTo(...q);cc.stroke();}}
  for(let i=0;i<12000;i++){cc.fillStyle=`rgba(104,82,44,${hash(i,4)*.08})`;cc.fillRect(hash(i,1)*512,hash(i,2)*512,1,1);}
  const ceramicMap=new THREE.CanvasTexture(ceramicCanvas);ceramicMap.colorSpace=THREE.SRGBColorSpace;ceramicMap.wrapS=ceramicMap.wrapT=THREE.RepeatWrapping;ceramicMap.channel=1;resources.push(ceramicMap);
  const ceramic=new THREE.MeshStandardMaterial({color:0xd7ccb3,map:ceramicMap,roughness:.59,bumpMap:ceramicMap,bumpScale:.00007,normalMap:paintNormal,normalScale:new THREE.Vector2(.05,.05),vertexColors:true});
  const glowCanvas=document.createElement('canvas');glowCanvas.width=4;glowCanvas.height=256;
  const gc=glowCanvas.getContext('2d');for(let y=0;y<256;y++){const v=Math.round((.30+.70*Math.pow(Math.abs(Math.cos(y/255*Math.PI*2)),6))*255);gc.fillStyle=`rgb(${v},${v},${v})`;gc.fillRect(0,y,4,1);}
  const glowMap=new THREE.CanvasTexture(glowCanvas);glowMap.colorSpace=THREE.SRGBColorSpace;resources.push(glowMap);
  const coilMaterial=new THREE.MeshStandardMaterial({color:0xa95c2b,metalness:.93,roughness:.29,normalMap:steelNormal,normalScale:new THREE.Vector2(.05,.05),emissive:0xff5910,emissiveMap:glowMap,emissiveIntensity:0});
  const solarCanvas=document.createElement('canvas');solarCanvas.width=1024;solarCanvas.height=512;
  const sc=solarCanvas.getContext('2d');sc.fillStyle='#071c48';sc.fillRect(0,0,1024,512);
  // Individually clipped monocrystalline wafers, crystalline speckle, fine silver fingers and copper bus bars.
  for(let row=0;row<4;row++) for(let col=0;col<8;col++) {
    const x=col*128+3,y=row*128+3,r=10;
    sc.fillStyle=`rgb(${8+hash(col,row)*4},${31+hash(col,row,5)*8},${72+hash(col,row,8)*18})`;
    sc.beginPath();sc.moveTo(x+r,y);sc.lineTo(x+122-r,y);sc.lineTo(x+122,y+r);sc.lineTo(x+122,y+122-r);sc.lineTo(x+122-r,y+122);sc.lineTo(x+r,y+122);sc.lineTo(x,y+122-r);sc.lineTo(x,y+r);sc.closePath();sc.fill();
  }
  for(let i=0;i<22000;i++){const x=hash(i,0)*1024,y=hash(i,1)*512;sc.fillStyle=`rgba(99,148,207,${hash(i,2)*.10})`;sc.fillRect(x,y,2+hash(i,3)*5,1);}
  sc.lineWidth=.5;sc.strokeStyle='rgba(171,196,216,.25)';
  for(let y=7;y<512;y+=6){sc.beginPath();sc.moveTo(0,y);sc.lineTo(1024,y);sc.stroke();}
  for(let x=32;x<1024;x+=64){sc.fillStyle='rgba(174,124,77,.8)';sc.fillRect(x,0,1.6,512);sc.fillStyle='rgba(234,211,170,.65)';sc.fillRect(x+.4,0,.5,512);}
  const solarMap=new THREE.CanvasTexture(solarCanvas);solarMap.colorSpace=THREE.SRGBColorSpace;solarMap.anisotropy=8;resources.push(solarMap);
  const solar=new THREE.MeshPhysicalMaterial({map:solarMap,color:0x9caac8,metalness:.02,roughness:.42,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.30,ior:1.45});
  const indicator=new THREE.ShaderMaterial({uniforms:{charge:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float charge;varying vec2 vUv;void main(){float bars=step(.18,fract(vUv.x*8.));float on=step(vUv.x,charge);vec3 c=mix(vec3(.012,.025,.022),vec3(.13,.85,.58)*1.5,on*bars);gl_FragColor=vec4(c,1.);}`,toneMapped:true});
  const inkCanvas=document.createElement('canvas');inkCanvas.width=1024;inkCanvas.height=256;const ic=inkCanvas.getContext('2d');
  ic.fillStyle='#c7b994';ic.font='bold 48px monospace';ic.fillText('SOLAR SOAKER',20,65);ic.font='22px monospace';ic.fillText('HELIOTHERMAL  /  SS–07',20,103);
  ic.font='17px monospace';ic.fillText('CAUTION  •  HOT SURFACE',20,151);ic.fillText('PV / 3 × MONO     0048–A',20,184);
  for(let i=0;i<70;i++){ic.fillRect(610+i*5,30,1+(i%3),100);}ic.font='18px monospace';ic.fillText('SERIAL 024 / 06',610,160);
  const inkMap=new THREE.CanvasTexture(inkCanvas);inkMap.colorSpace=THREE.SRGBColorSpace;resources.push(inkMap);
  const ink=new THREE.MeshStandardMaterial({map:inkMap,alphaTest:.35,roughness:.8,depthWrite:false});

  let opticMode=false;
  function add(material,geo,position=[0,0,0],rotation=[0,0,0],tint=0xffffff) {
    geo=geo.index?geo.toNonIndexed():geo;
    geo.clearGroups();
    // Restrict every batch to compatible attributes.
    for(const key of Object.keys(geo.attributes)) if(!['position','normal','uv'].includes(key)) geo.deleteAttribute(key);
    if(!geo.attributes.uv) geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    if(material.vertexColors){const c=new THREE.Color(tint),a=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}geo.setAttribute('color',new THREE.Float32BufferAttribute(a,3));}
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1)));
    if(opticMode){const p=geo.attributes.position,n=geo.attributes.normal;for(let i=0;i<p.count;i++){p.setXYZ(i,p.getX(i)+.035,.28+(p.getY(i)-.28)*.64,p.getZ(i));const v=new THREE.Vector3(n.getX(i),n.getY(i)/.64,n.getZ(i)).normalize();n.setXYZ(i,v.x,v.y,v.z);}}
    const pp=geo.attributes.position,nn=geo.attributes.normal,uv1=new Float32Array(pp.count*2);
    // Metric, dominant-axis UVs keep real PBR grain at a consistent physical size on bevels and caps.
    for(let i=0;i<pp.count;i++){
      const nx=Math.abs(nn.getX(i)),ny=Math.abs(nn.getY(i)),nz=Math.abs(nn.getZ(i));
      uv1[i*2]=(nx>ny&&nx>nz?pp.getZ(i):pp.getX(i))*6;
      uv1[i*2+1]=(ny>nx&&ny>nz?pp.getZ(i):pp.getY(i))*6;
    }
    geo.setAttribute('uv1',new THREE.Float32BufferAttribute(uv1,2));
    if(!batches.has(material)) batches.set(material,[]);
    batches.get(material).push(geo);
    return geo;
  }
  const rect=(z0,z1,y0,y1,c=0)=>[[z0+c,y0],[z1-c,y0],[z1,y0+c],[z1,y1-c],[z1-c,y1],[z0+c,y1],[z0,y1-c],[z0,y0+c]];
  function makeShape(outline,holes=[]) {const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(-p[0],p[1])));for(const hole of holes)shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(-p[0],p[1]))));return shape;}
  function remapTile(geo,tile,planar=true) {
    const p=geo.attributes.position,u=geo.attributes.uv,n=geo.attributes.normal;
    geo.computeBoundingBox();const z0=geo.boundingBox.min.z,zSpan=geo.boundingBox.max.z-z0;
    for(let i=0;i<p.count;i++) {
      const wall=planar&&Math.abs(n.getZ(i))<.9;
      const t=wall?boxTile:tile;
      const x=wall?t.minX+(p.getZ(i)-z0)/zSpan*t.w:planar?-p.getX(i):t.minX+u.getX(i)*t.w;
      const y=wall?t.minY+THREE.MathUtils.euclideanModulo(p.getX(i)+p.getY(i),.14):planar?p.getY(i):t.minY+u.getY(i)*t.h;
      u.setXY(i,(t.tx+t.pad+(x-t.minX)/t.w*(t.size-2*t.pad))/2048,1-(t.ty+t.pad+(y-t.minY)/t.h*(t.size-2*t.pad))/2048);
    }
    return geo;
  }
  function profile(mat,outline,depth,x=0,holes=[],bevel=.0015,tile=null) {
    const g=new THREE.ExtrudeGeometry(makeShape(outline,holes),{depth,bevelEnabled:bevel>0,bevelSegments:2,steps:1,bevelThickness:bevel,bevelSize:bevel,curveSegments:8});
    if(mat===paint)remapTile(g,tile||paintTile(outline,holes));
    else {const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*5,uv.getY(i)*5);}
    g.translate(0,0,-depth/2);return add(mat,g,[x,0,0],[0,Math.PI/2,0]);
  }
  const boxTile=paintTile([[0,0],[.12,0],[.12,.14],[0,.14]]);
  function box(mat,w,h,d,pos,rot=[0,0,0],radius=.002,tint=0xffffff) {
    const g=new RoundedBoxGeometry(w,h,d,radius>=.003?2:1,Math.min(radius,w/3,h/3,d/3));
    if(mat===paint)remapTile(g,boxTile,false);
    return add(mat,g,pos,rot,tint);
  }
  function lathe(mat,points,z,y=.177,tint=0xffffff,segments=48) {
    const g=new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),segments);if(mat===paint)remapTile(g,boxTile,false);return add(mat,g,[0,y,z],[Math.PI/2,0,0],tint);
  }
  function ring(mat,r,inner,length,z,y=.177,tint=0xffffff) {
    return lathe(mat,[[inner,-length/2],[r-.001,-length/2],[r,-length/2+.001],[r,length/2-.001],[r-.001,length/2],[inner,length/2],[inner,-length/2]],z,y,tint);
  }
  function screw(x,y,z,side=1,r=.0032) {
    // Recess, hex socket head, and a real dark slot, shared with steel/dark batches.
    const g=new THREE.CylinderGeometry(r*1.35,r*1.35,.0009,12);add(dark,g,[x,y,z],[0,0,Math.PI/2]);
    add(steel,new THREE.CylinderGeometry(r,r,.0015,12),[x+side*.0006,y,z],[0,0,Math.PI/2],0xe8e4d9);
    box(dark,.001,.0007,r*1.35,[x+side*.0015,y,z],[.65,0,0],.0001);
  }

  // Dark continuous chassis supports independent yellow covers, leaving real seams.
  profile(dark,[[-.372,.108],[-.37,.215],[-.335,.217],[.232,.217],[.312,.226],[.315,.085],[.257,.076],[.19,.135],[.047,.135],[.006,.086],[-.072,.085],[-.107,.117]],.104);
  const frontPanel=[[-.37,.115],[-.37,.206],[-.345,.218],[-.13,.218],[-.13,.116],[-.208,.113],[-.235,.098],[-.34,.098]];
  const hex=[];
  for(let row=0;row<3;row++)for(let col=0;col<7;col++) {const z=-.205+col*.009+(row%2)*.0045,y=.153+row*.009;hex.push(Array.from({length:6},(_,i)=>[z+Math.cos(i*Math.PI/3)*.0031,y+Math.sin(i*Math.PI/3)*.0031]));}
  const oval=rect(-.328,-.255,.153,.169,.006);
  const frontTile=paintTile(frontPanel,[...hex,oval]);
  for(const side of [-1,1])profile(paint,frontPanel,.007,side*.056,[...hex,oval],.0012,frontTile);
  // Recessed cooling vanes remain visible behind the machined front port.
  for(let i=0;i<10;i++) for(const side of [-1,1]) box(steel,.005,.014,.002,[side*.052,.16,-.321+i*.0065],[.2,0,0],.0005,0x65615a);
  const rearPanel=[[-.124,.117],[-.124,.216],[.191,.216],[.178,.133],[.071,.133],[.053,.105],[-.039,.105],[-.053,.087],[-.089,.092]];
  const slots=[];for(let i=0;i<5;i++){const z=-.093+i*.020;slots.push([[z,.147],[z+.011,.147],[z+.023,.172],[z+.012,.172]]);}
  const rearTile=paintTile(rearPanel,slots);
  for(const side of [-1,1])profile(paint,rearPanel,.007,side*.056,slots,.0012,rearTile);
  // Rear stock flares down toward the padded shoulder contact, as in the side reference.
  const stock=[[.185,.133],[.196,.215],[.216,.264],[.292,.256],[.317,.226],[.317,.068],[.281,.062],[.244,.084],[.224,.126]];
  const stockSlots=[rect(.249,.283,.171,.175,.0015),rect(.247,.287,.181,.185,.0015),rect(.251,.283,.191,.195,.0015)];
  const stockTile=paintTile(stock,stockSlots);
  for(const side of [-1,1])profile(paint,stock,.008,side*.058,stockSlots,.002,stockTile);
  box(paint,.116,.037,.076,[0,.239,.267],[0,0,0],.006);
  profile(rubber,[[.319,.061],[.338,.066],[.347,.087],[.347,.232],[.338,.251],[.317,.252]],.126,0,[],.004);
  for(let i=0;i<7;i++)box(rubber,.133,.005,.009,[0,.087+i*.021,.344],[0,0,0],.001,0x72716c);
  // Exactly three broad, chamfered modules on a single sloping roof, with the rail on its high edge.
  const panelSpans=[[-.345,-.157],[-.151,.058],[.064,.209]];
  function roofPlate(mat,w,len,thickness,z,offset,cut) {
    const a=w/2,b=len/2,c=cut;
    const outline=[[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]];
    const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(...p)));
    const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:true,bevelSize:.0007,bevelThickness:.0006,bevelSegments:2});
    if(mat===paint){const tile=paintTile(outline);const p=g.attributes.position,u=g.attributes.uv;for(let i=0;i<p.count;i++){u.setXY(i,(tile.tx+tile.pad+(p.getX(i)-tile.minX)/tile.w*(tile.size-2*tile.pad))/2048,1-(tile.ty+tile.pad+(p.getY(i)-tile.minY)/tile.h*(tile.size-2*tile.pad))/2048);}}
    if(mat===solar){const p=g.attributes.position,u=g.attributes.uv;for(let i=0;i<p.count;i++)u.setXY(i,(p.getX(i)+a)/w,(p.getY(i)+b)/len);}
    g.rotateX(-Math.PI/2);add(mat,g,[0,.241+offset,z],[0,0,.38]);
  }
  roofPlate(paint,.132,.582,.005,-.068,-.003,.016);
  for(let i=0;i<panelSpans.length;i++) {
    const [a,b]=panelSpans[i],z=(a+b)/2,len=b-a,cut=i===1?.003:.013;
    roofPlate(paint,.128,len+.004,.004,z,.001,cut);
    roofPlate(dark,.122,len,.002,z,.005,cut);
    roofPlate(solar,.117,len-.006,.0014,z,.007,cut);
    box(steel,.0012,.001,len-.018,[-.057,.225,z],[0,0,.38],.0003,0xbcae8f);
  }
  // Split receiver clamps at the ceramic collar and stock.
  for(const z of [-.365,.216]) {ring(paint,.069,.057,.009,z,.184);for(const side of [-1,1])for(const y of [.128,.205])screw(side*.064,y,z,side);}

  // Trigger guard has an actual open interior and a curved steel trigger.
  const guard=[[-.073,.105],[.042,.105],[.06,.066],[.058,.017],[.039,.002],[-.052,.002],[-.073,.018]];
  const guardHole=[[-.049,.082],[.03,.082],[.038,.062],[.036,.022],[-.039,.022],[-.049,.032]];
  profile(paint,guard,.034,0,[guardHole],.002);
  profile(steel,[[-.009,.083],[.001,.083],[.006,.063],[.005,.045],[-.004,.03],[-.009,.032],[-.004,.049]],.009,0,[],.0008);
  // Rear-canted rubber grip with moulded palm and finger pads.
  const grip=[[.026,.094],[.082,.107],[.092,.066],[.133,-.071],[.126,-.084],[.071,-.099],[.058,-.085],[.056,-.046],[.034,.012]];
  const shorten=p=>[p[0],p[1]<.03?.03+(p[1]-.03)*.80:p[1]];
  profile(rubber,grip.map(shorten),.053,0,[],.005);
  for(const side of [-1,1]) {
    profile(rubber,[[.062,.044],[.088,.04],[.122,-.068],[.077,-.081],[.066,-.048],[.052,.014]].map(shorten),.002,side*.029,[],.001);
    for(let i=0;i<7;i++)box(rubber,.002,.003,.042,[side*.031,.023-i*.0115,.067+i*.0043],[.27,0,0],.001,0xeeeeea);
    screw(side*.031,-.055,.104,side,.003);
  }
  box(dark,.06,.012,.07,[0,-.065,.101],[.27,0,0],.004);
  // Front vertical foregrip with yellow end shoe and raised horizontal ridges.
  box(dark,.063,.019,.075,[0,.097,-.294],[0,0,0],.004);
  box(rubber,.056,.153,.059,[0,.014,-.294],[0,0,0],.006);
  box(paint,.059,.012,.061,[0,-.067,-.294],[0,0,0],.004);
  for(const side of [-1,1])for(let i=0;i<4;i++)box(rubber,.003,.012,.036,[side*.029,.061-i*.028,-.294],[0,0,0],.003,0xffffff);

  // Steel muzzle cage: two turned rings plus six bevelled window plates with true holes.
  const barrelY=.177;
  lathe(dark,[[.037,-.104],[.044,-.104],[.044,.101],[.037,.101],[.037,-.104]],-.518,barrelY);
  ring(steel,.079,.066,.018,-.615,barrelY,0xb6b2a8);
  ring(steel,.080,.065,.018,-.438,barrelY,0x9f9d93);
  ring(dark,.067,.053,.011,-.626,barrelY);
  ring(steel,.061,.045,.008,-.633,barrelY,0xc4bca9);
  const densify=points=>points.flatMap((p,i)=>{const q=points[(i+1)%points.length],n=Math.max(1,Math.ceil(Math.abs(q[1]-p[1])/.005));return Array.from({length:n},(_,j)=>[p[0]+(q[0]-p[0])*j/n,p[1]+(q[1]-p[1])*j/n]);});
  const cageOutline=densify(rect(-.61,-.443,-.036,.036,.009));
  const cageWindow=[[-.589,-.024],[-.465,-.024],[-.455,-.014],[-.455,.014],[-.465,.024],[-.589,.024],[-.599,.014],[-.599,-.014]];
  for(let i=0;i<6;i++) {
    const angle=i*Math.PI/3;
    const cg=new THREE.ExtrudeGeometry(makeShape(cageOutline,[densify(cageWindow)]),{depth:.006,bevelEnabled:true,bevelSegments:2,bevelSize:.0015,bevelThickness:.001,steps:1});
    cg.translate(0,0,-.003);cg.rotateY(Math.PI/2);
    const cp=cg.attributes.position,cn=cg.attributes.normal;
    for(let j=0;j<cp.count;j++){
      const a=cp.getY(j)/.075,r=.075+cp.getX(j),c=Math.cos(a),s=Math.sin(a),nx=cn.getX(j),ny=cn.getY(j);
      cp.setXYZ(j,r*c,r*s,cp.getZ(j));cn.setXYZ(j,nx*c-ny*s,nx*s+ny*c,cn.getZ(j));
    }
    cg.rotateZ(angle);cg.translate(0,barrelY,0);add(steel,cg);
    for(const z of [-.602,-.453]) {
      const r=.079;const sg=new THREE.CylinderGeometry(.0035,.0035,.0015,12);sg.rotateZ(-Math.PI/2);sg.translate(r,0,z);sg.rotateZ(angle);sg.translate(0,barrelY,0);add(steel,sg,[0,0,0],[0,0,0],0xc6c0ad);
      const slot=new THREE.BoxGeometry(.001,.001,.0038);slot.translate(r+.001,0,z);slot.rotateZ(angle);slot.translate(0,barrelY,0);add(dark,slot);
    }
  }
  for(let i=0;i<6;i++){const a=i*Math.PI/3;box(steel,.026,.016,.008,[Math.cos(a)*.063,barrelY+Math.sin(a)*.063,-.631],[0,0,a],.003,0xc5bda7);}
  // Closely spaced turned copper windings, each with a circular section, keep the bore open.
  for(let i=0;i<18;i++) {
    const points=[];for(let j=0;j<=10;j++){const a=j/10*Math.PI*2;points.push([.052+Math.cos(a)*.0038,Math.sin(a)*.0038]);}
    lathe(coilMaterial,points,-.604+i*.0088,barrelY,0xffffff,48);
  }
  ring(coilMaterial,.055,.043,.006,-.615,barrelY);
  ring(steel,.051,.039,.006,-.621,barrelY,0x806a50);
  // Cream ceramic thermal break: stepped glazed ring, dark gasket, machined retaining bands.
  ring(dark,.067,.046,.023,-.424,barrelY);
  lathe(ceramic,[[.048,-.023],[.064,-.023],[.069,-.018],[.070,-.012],[.070,.012],[.067,.02],[.061,.024],[.048,.024],[.048,-.023]],-.397,barrelY);
  for(const z of [-.421,-.373])ring(steel,.072,.063,.005,z,barrelY,0x8f8978);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box(dark,.003,.008,.013,[Math.cos(a)*.0705,barrelY+Math.sin(a)*.0705,-.397],[0,0,a],.001,0x9b7560);}
  // Turned ceramic grain lines and narrow collar ridges.
  for(const z of [-.414,-.409,-.384,-.38])ring(ceramic,.0702,.069,.001,z,barrelY,0xb6aa8c);

  // Picatinny rail sits on the ridge, with individually machined cross slots.
  box(dark,.039,.008,.288,[.035,.271,-.115],[0,0,0],.0015);
  for(let i=0;i<19;i++)box(dark,.049,.007,.006,[.035,.278,-.252+i*.0144],[0,0,0],.001,0xb2b1a8);
  opticMode=true;
  box(dark,.057,.018,.087,[0,.291,.002],[0,0,0],.002);
  box(dark,.062,.016,.069,[0,.306,.002],[0,0,0],.002);
  for(const side of [-1,1])for(const z of [-.023,.027])screw(side*.032,.306,z,side,.004);
  // Open reflex hood, no opaque plane blocking the optic.
  const hoodOuter=[[-.033,.316],[.033,.316],[.038,.323],[.038,.367],[.03,.38],[-.029,.38],[-.038,.37],[-.038,.326]];
  const hoodInner=[[-.027,.325],[.027,.325],[.029,.33],[.029,.363],[.024,.37],[-.024,.37],[-.029,.363],[-.029,.331]];
  // Here shape X is horizontal rather than longitudinal.
  const hs=new THREE.Shape(hoodOuter.map(p=>new THREE.Vector2(...p)));hs.holes.push(new THREE.Path(hoodInner.map(p=>new THREE.Vector2(...p))));
  add(dark,new THREE.ExtrudeGeometry(hs,{depth:.012,bevelEnabled:true,bevelSize:.0015,bevelThickness:.001,bevelSegments:2,steps:1}),[0,0,-.026]);
  // Hood rearward braces and windage turret.
  for(const side of [-1,1])profile(dark,[[-.012,.318],[.042,.318],[.034,.332],[-.006,.361],[-.011,.359],[.022,.329],[-.012,.329]],.007,side*.031,[],.001);
  add(dark,new THREE.CylinderGeometry(.012,.012,.011,32),[.039,.319,.026],[0,0,Math.PI/2]);
  add(steel,new THREE.CylinderGeometry(.009,.009,.001,32),[.045,.319,.026],[0,0,Math.PI/2],0xa59d86);
  for(let i=0;i<16;i++)box(dark,.003,.002,.002,[.042,.319+Math.sin(i*Math.PI/8)*.0115,.026+Math.cos(i*Math.PI/8)*.0115],[i*Math.PI/8,0,0],.0002);

  const glassMaterial=new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,forceSinglePass:true,depthWrite:false,toneMapped:false,
    uniforms:{eyeLocal:{value:new THREE.Vector3()},lensZ:{value:-.098},opticalY:{value:.32288},opticalX:{value:.035}},
    vertexShader:`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 eyeLocal;uniform float lensZ;uniform float opticalY;uniform float opticalX;varying vec3 vLocal;
      void main(){
        // Collimated reticle: compare the viewing RAY to the barrel axis, not lens UV.
        // Lateral eye movement shifts the dot across the glass while its world direction stays fixed.
        vec3 ray=normalize(vLocal-eyeLocal);float facing=step(.001,eyeLocal.z-lensZ);
        float angle=length(ray.xy);float dotCore=(1.-smoothstep(.0024,.0036,angle))*facing;
        float halo=exp(-angle*angle/0.00009)*.30*facing;
        float edge=pow(clamp(length(vec2((vLocal.x-opticalX)/.031,(vLocal.y-opticalY)/.01664)),0.,1.),5.);
        vec3 glass=mix(vec3(.18,.33,.33),vec3(.65,.31,.07),edge);
        float a=.055+edge*.14;vec3 color=mix(glass,vec3(3.,.12,.02),clamp(dotCore+halo,0.,1.));
        gl_FragColor=vec4(color,max(a,clamp(dotCore+halo,0.,1.)));
      }`
  });
  const lensShape=new THREE.Shape(hoodInner.map(p=>new THREE.Vector2(...p)));
  add(glassMaterial,new THREE.ShapeGeometry(lensShape),[0,0,-.018]);
  opticMode=false;

  // Service fasteners, small access plates, engraved warning and serial marks.
  for(const side of [-1,1]) {
    for(const [z,y] of [[-.35,.128],[-.34,.202],[-.235,.122],[-.14,.203],[-.117,.126],[-.112,.203],[.025,.12],[.17,.15],[.186,.202],[.235,.221],[.305,.09],[.303,.213]])screw(side*.061,y,z,side);
    box(dark,.002,.023,.047,[side*.063,.123,-.295],[0,0,0],.003);
    screw(side*.065,.123,-.31,side,.002);screw(side*.065,.123,-.28,side,.002);
    // Charge LEDs: both faces share a single shader batch.
    box(dark,.003,.014,.065,[side*.062,.195,-.057],[0,0,0],.002);
    const led=new THREE.PlaneGeometry(.056,.007);add(indicator,led,[side*.064,.195,-.057],[0,side*Math.PI/2,0]);
    const decal=new THREE.PlaneGeometry(.113,.028);add(ink,decal,[side*.0608,.189,.101],[0,side*Math.PI/2,0]);
  }
  paintMap.needsUpdate=paintMetal.needsUpdate=true;
  for(const [material,geometries] of batches) {
    const geometry=mergeGeometries(geometries,false);
    geometry.translate(0,0,-.08); // Put the palm centre at the requested grip datum.
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=material===paint?'Chipped mustard shell':material===solar?'Three glazed photovoltaic modules':material===coilMaterial?'Copper heat windings':material===glassMaterial?'Collimated red dot lens':'Weapon '+group.children.length;
    mesh.castShadow=mesh.receiveShadow=true;
    if(material===glassMaterial||material===ink){mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=material===glassMaterial?3:2;}
    group.add(mesh);geometries.forEach(g=>g.dispose());
  }
  const muzzle=new THREE.Object3D();muzzle.name='Muzzle (-Z)';muzzle.position.set(0,barrelY,-.722);group.add(muzzle);
  const sight=new THREE.Object3D();sight.name='Optical axis (-Z)';sight.position.set(.035,.32288,-.098);group.add(sight);
  const eyeWorld=new THREE.Vector3();
  const glassMesh=group.children.find(m=>m.material===glassMaterial);
  glassMesh.onBeforeRender=(_renderer,_scene,camera)=>{
    camera.getWorldPosition(eyeWorld);group.worldToLocal(eyeWorld);glassMaterial.uniforms.eyeLocal.value.copy(eyeWorld);
  };
  let heat=0,charge=1;
  const cold=new THREE.Color(0xa95c2b),hot=new THREE.Color(0xe79742);
  function setHeat(value){heat=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);coilMaterial.color.copy(cold).lerp(hot,heat);coilMaterial.emissive.setRGB(1,.04+.06*heat,.001+.001*heat);coilMaterial.emissiveIntensity=heat*heat*3.2;coilMaterial.roughness=.29+.09*heat;}
  function setCharge(value){charge=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);indicator.uniforms.charge.value=charge;}
  function update(_dt){/* Heat and charge are externally driven; no baked weapon animation. */}
  group.userData.ready=ready;
  group.userData.dimensionsMetres={length:.99,width:.16,height:.423};
  group.userData.dispose=()=>{group.traverse(o=>o.geometry?.dispose());for(const material of batches.keys())material.dispose();resources.forEach(t=>t.dispose());};
  setHeat(0);setCharge(1);
  return {group,muzzle,sight,coilMaterial,setHeat,setCharge,update};
}
