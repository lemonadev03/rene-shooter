import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  clamp,
  lerp,
  smoothstep01,
  rand,
  V3,
  canvasTex,
  mat,
  box,
  cyl,
  sph,
} from "../core/utils.js";
import { scene, balls, player, PLAYER_R } from "../core/state.js";
import { shoreZ, seaZ, bedY } from "./ocean.js";
import {
  addCircle,
  addSeg,
  addBox,
  resolveCollision,
} from "../core/collision.js";
export const PIER = { x: 38, z: 26, len: 25, w: 3.6, bottom: 2.25 };
let bonfireFlames = [];
let sailboats = [];
export function initBeach() {
  const sandTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#f0d488";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = ["#e8c975", "#f7e3a0", "#d9b95f", "#fff3c4"][i % 4];
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(20, 9);
  // shoreline: gently wobbly, and the seabed is a real slope that dips under the water. Mirrored in the water shader.
  // dry sand (flat) up to z=9, then the sloped shore/seabed mesh takes over
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 70),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, -26);
  sand.receiveShadow = true;
  scene.add(sand);
  {
    const bedMesh = (Z0, Z1, NX, NZ, material, tinted) => {
      const geo = new THREE.PlaneGeometry(340, Z1 - Z0, NX, NZ);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, (Z0 + Z1) / 2);
      const pa = geo.attributes.position,
        col = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i),
          z = pa.getZ(i),
          d = z - shoreZ(x);
        pa.setY(i, bedY(x, z));
        const wet = smoothstep01((d + 2.4) / 2.0),
          deep = smoothstep01(d / 9); // dry -> wet sand at the waterline -> slightly cooler seabed
        col[i * 3] = lerp(1, 0.8, wet) * lerp(1, 0.78, deep);
        col[i * 3 + 1] = lerp(1, 0.74, wet) * lerp(1, 0.9, deep);
        col[i * 3 + 2] = lerp(1, 0.62, wet) * lerp(1, 0.95, deep);
      }
      if (tinted) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, material);
      m.receiveShadow = tinted;
      scene.add(m);
      return m;
    };
    const shoreTex = sandTex.clone();
    shoreTex.needsUpdate = true;
    shoreTex.repeat.set(20, 2.6);
    bedMesh(
      9,
      34,
      85,
      25,
      new THREE.MeshStandardMaterial({
        map: shoreTex,
        vertexColors: true,
        roughness: 0.9,
      }),
      true,
    ); // the beach slope and shallows
    bedMesh(
      34,
      122,
      40,
      22,
      new THREE.MeshBasicMaterial({ color: 0x8fae9c }),
      false,
    );
  } // deep seabed: always under >1.4 m of water, so it gets a cheap flat material
  // sand detail: tonal patches, shells, starfish
  {
    const patchCols = [0xe6c87a, 0xf5df9e, 0xdec084];
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Mesh(
        new THREE.CircleGeometry(rand(1.2, 3.4), 18),
        new THREE.MeshStandardMaterial({
          color: patchCols[i % 3],
          roughness: 1,
          transparent: true,
          opacity: 0.5,
        }),
      );
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rand(0, 3);
      p.scale.y = rand(0.5, 0.8);
      p.position.set(rand(-48, 48), 0.008, rand(-36, 11));
      p.receiveShadow = true;
      scene.add(p);
    }
    const shellCols = [0xfff1e6, 0xffb4a2, 0xf9c6d3, 0xffffff];
    for (let i = 0; i < 34; i++) {
      const s = sph(
        rand(0.09, 0.17),
        mat(shellCols[i % 4], 0.5),
        rand(-48, 48),
        0.05,
        rand(-34, 12),
        10,
        8,
      );
      s.scale.y = 0.45;
      s.castShadow = false;
      scene.add(s);
    }
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Group();
      st.position.set(rand(-40, 40), 0.06, rand(-30, 12));
      st.rotation.y = rand(0, 3);
      for (let a = 0; a < 5; a++) {
        const arm = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.42, 6),
          mat(0xff8c42, 0.7),
        );
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = (-a / 5) * Math.PI * 2;
        arm.translateX(0.18);
        arm.scale.y = 0.5;
        st.add(arm);
      }
      scene.add(st);
    }
  }
  // dune mounds + grass tufts along the back (north)
  for (let i = 0; i < 9; i++) {
    const d = sph(
      rand(4, 8),
      mat(0xeccf7d, 0.95),
      -55 + i * 13 + rand(-2, 2),
      -1.5,
      -46 + rand(-2, 2),
    );
    d.scale.y = 0.38;
    d.castShadow = false;
    scene.add(d);
  }
  {
    const gm = mat(0x4c9a4c, 0.85);
    for (let i = 0; i < 46; i++) {
      const x = rand(-58, 58),
        z = rand(-50, -33);
      for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(
          new THREE.ConeGeometry(0.07, rand(0.5, 0.95), 5),
          gm,
        );
        c.position.set(x + rand(-0.25, 0.25), 0.3, z + rand(-0.25, 0.25));
        c.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
        scene.add(c);
      }
    }
  }
  // geyser vents on the shore — where the water monsters bubble up from
  bonfireFlames = []; // animated geyser jets
  function bonfire(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.28),
        mat(0x8d99ae, 0.9),
      );
      s.position.set(Math.cos(a) * 1.05, 0.14, Math.sin(a) * 1.05);
      s.castShadow = true;
      g.add(s);
    }
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 22),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.15,
        transparent: true,
        opacity: 0.92,
        emissive: 0x0369a1,
        emissiveIntensity: 0.4,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    g.add(pool);
    const fm = [
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        transparent: true,
        opacity: 0.75,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x7dd3fc,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        transparent: true,
        opacity: 0.65,
      }),
    ];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, rand(1.1, 1.6), 8),
        fm[i % 2],
      );
      f.position.set(rand(-0.25, 0.25), 0.8, rand(-0.25, 0.25));
      g.add(f);
      bonfireFlames.push({ f, ph: rand(0, 6) });
    }
    addCircle(x, z, 1.25, 0.55); // ring of rocks around the vent
  }
  [-36, -18, -2, 18, 36].forEach((x) => bonfire(x, 11.5));
  // wooden pier reaching into the sea (east side): one continuous deck on stilts, so you can walk underneath it between the posts

  {
    const g = new THREE.Group();
    g.position.set(PIER.x, 0, PIER.z);
    const wm = mat(0x8a6a40, 0.9);
    const plankTex = canvasTex(64, 32, (c, w, h) => {
      c.fillStyle = "#b08954";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        c.fillStyle = ["#a37d49", "#bb955d", "#9d7842"][i % 3];
        c.fillRect(Math.random() * w, Math.random() * (h - 3), rand(6, 22), 1);
      }
      c.fillStyle = "#5e4527";
      c.fillRect(0, h - 3, w, 3);
    });
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.repeat.set(1, PIER.len / 0.5);
    const deck = box(
      PIER.w,
      0.2,
      PIER.len,
      new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 }),
      0,
      2.52,
      0,
    );
    g.add(deck); // planks (one textured slab: cheap to draw)
    // merged wood parts (few draw calls, same look)
    const merge = (parts) => {
      const ms = new THREE.Mesh(mergeGeometries(parts), wm);
      ms.castShadow = true;
      ms.receiveShadow = true;
      return ms;
    };
    const bx = (w, h, d, x, y, z) =>
      new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const under = [
      ...[-1.25, 1.25].map((px) => bx(0.2, 0.26, PIER.len, px, 2.3, 0)),
    ]; // stringers under the planks
    const rails = [];
    [-1.72, 1.72].forEach((px) => {
      rails.push(
        bx(0.1, 0.08, PIER.len, px, 3.58, 0),
        bx(0.06, 0.06, PIER.len, px, 3.1, 0),
      );
      for (let i = 0; i < 13; i++)
        rails.push(bx(0.09, 1.05, 0.09, px, 3.1, -12 + i * 2));
    });
    for (let i = 0; i < 9; i++)
      [-1.55, 1.55].forEach((px) => {
        under.push(
          new THREE.CylinderGeometry(0.15, 0.15, 4, 8).translate(
            px,
            0.4,
            -12 + i * 3,
          ),
        );
        addCircle(PIER.x + px, PIER.z - 12 + i * 3, 0.2, 2.4);
      }); // posts run down into the seabed
    const sub = merge(under);
    g.add(sub, merge(rails));
    scene.add(g);
  }
  // sailboats drifting on the horizon
  sailboats = [];
  function sailboat(x, z, sailCol, spd) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(box(2.6, 0.5, 0.8, mat(0xffffff, 0.5), 0, 0.15, 0));
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 2.6);
    shape.lineTo(1.5, 0.15);
    shape.lineTo(0, 0);
    const sail = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      mat(sailCol, 0.6, 0, { side: THREE.DoubleSide }),
    );
    sail.position.set(-0.1, 0.4, 0);
    g.add(sail);
    g.add(cyl(0.04, 0.04, 2.9, mat(0x8a6242, 0.8), -0.1, 1.8, 0, 6));
    g.scale.setScalar(1.6);
    scene.add(g);
    sailboats.push({ g, spd, ph: rand(0, 6) });
  }
  sailboat(-55, 72, 0xff4d6d, 0.55);
  sailboat(30, 88, 0xffd23a, -0.4);
  sailboat(75, 64, 0xffffff, 0.33);
  // distant islands
  [
    [-75, 95],
    [55, 115],
    [95, 80],
  ].forEach(([x, z]) => {
    const isl = new THREE.Mesh(
      new THREE.ConeGeometry(rand(9, 15), rand(4, 7), 7),
      mat(0x3f9e5f, 0.9),
    );
    isl.position.set(x, 0, z);
    scene.add(isl);
  });
  // palm tree
  const trunkMat = mat(0x8a6242, 0.9),
    leafMat = mat(0x21a356, 0.8, 0, { side: THREE.DoubleSide }),
    cocoMat = mat(0x6b4a26, 0.8);
  function palm(x, z, lean = 0.25, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const curve = new THREE.CatmullRomCurve3([
      V3(0, 0, 0),
      V3(lean * 1.2, 2.2, 0),
      V3(lean * 3, 4.6, 0),
    ]);
    const trunk = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, 0.22, 8),
      trunkMat,
    );
    trunk.castShadow = true;
    g.add(trunk);
    const top = V3(lean * 3, 4.7, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.6, 6, 1),
        leafMat,
      );
      const pos = leaf.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v);
        pos.setZ(v, -Math.pow(Math.max(0, px), 2) * 0.22);
      }
      leaf.geometry.computeVertexNormals();
      const dir = V3(Math.cos(a), 0, Math.sin(a));
      leaf.position.copy(top).addScaledVector(dir, 1.6);
      leaf.position.y += 0.18;
      leaf.rotation.order = "YXZ";
      leaf.rotation.y = -a;
      leaf.rotation.x = -Math.PI / 2 + 0.3;
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.add(
      sph(0.24, cocoMat, top.x + 0.3, top.y - 0.3, 0.15),
      sph(0.22, cocoMat, top.x - 0.25, top.y - 0.3, -0.1),
    );
    g.scale.setScalar(s);
    g.rotation.y = rand(0, 6.28);
    scene.add(g);
    g.updateMatrixWorld(true);
    // trunk collider follows the lean: two capsules that block walkers, two upper ones that only stop shots
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
      return g.localToWorld(best.clone());
    };
    const hs = [0, 1.2, 2.4, 3.5, 4.6],
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
  [
    [-20, -28],
    [-32, -12],
    [-26, 8],
    [24, -30],
    [34, -14],
    [28, 6],
    [-8, -36],
    [12, -34],
    [-42, -22],
    [44, -24],
    [6, 10],
    [-14, 12],
  ].forEach(([x, z]) =>
    palm(
      x,
      z,
      rand(0.1, 0.45) * (Math.random() < 0.5 ? -1 : 1),
      rand(0.9, 1.25),
    ),
  );
  // umbrellas + towels + beach balls
  const umbCols = [0xff4d6d, 0xffb020, 0x00b4d8, 0x7c3aed, 0xff6b35];
  function umbrella(x, z, c) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pole = cyl(0.05, 0.05, 2.6, mat(0xdddddd, 0.4, 0.6), 0, 1.3, 0);
    g.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 0.65, 10, 1, true),
      mat(c, 0.6, 0, { side: THREE.DoubleSide }),
    );
    top.position.y = 2.6;
    top.castShadow = true;
    g.add(top);
    g.rotation.z = 0.12;
    scene.add(g);
    g.updateMatrixWorld(true);
    const pt = g.localToWorld(V3(0, 2.1, 0));
    addSeg(x, z, pt.x, pt.z, 0.2, 2.6);

    const tow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), mat(c, 0.9));
    tow.rotation.x = -Math.PI / 2;
    tow.rotation.z = rand(0, 3);
    tow.position.set(x + 1.2, 0.03, z + 0.6);
    tow.receiveShadow = true;
    scene.add(tow);
  }
  [
    [-12, -6],
    [14, -2],
    [-4, 6],
    [20, 10],
    [-24, 2],
  ].forEach(([x, z], i) => umbrella(x, z, umbCols[i]));
  // Kickable beach balls share collision state with the player.
  [
    [-18, -9],
    [22, -6],
    [-11, 9],
    [16, -24],
    [-28, -18],
  ].forEach(([x, z], i) => {
    const b = sph(0.42, mat(umbCols[i], 0.25), x, 0.42, z);
    scene.add(b);
    balls.push({ m: b, vx: 0, vz: 0 });
  });
  // volleyball net
  {
    const g = new THREE.Group();
    g.position.set(-16, 0, -16);
    g.rotation.y = 0.5;
    const pm = mat(0xffffff, 0.5, 0.4);
    g.add(
      cyl(0.06, 0.06, 2.4, pm, -3, 1.2, 0),
      cyl(0.06, 0.06, 2.4, pm, 3, 1.2, 0),
    );
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 0.9),
      mat(0xffffff, 0.8, 0, {
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    );
    net.position.y = 1.85;
    g.add(net);
    scene.add(g);
    g.updateMatrixWorld(true);
    const pa = g.localToWorld(V3(-3, 0, 0)),
      pb = g.localToWorld(V3(3, 0, 0));
    addCircle(pa.x, pa.z, 0.2, 2.4);
    addCircle(pb.x, pb.z, 0.2, 2.4);
    addSeg(pa.x, pa.z, pb.x, pb.z, 0.1, 2.3, 1.4);
  }
  // lifeguard tower
  {
    const g = new THREE.Group();
    g.position.set(17, 0, -18);
    g.rotation.y = -0.4;
    const wm = mat(0xf4f4f4, 0.7),
      rm = mat(0xe63946, 0.6);
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([x, z]) => {
      const l = box(0.18, 3, 0.18, wm, x, 1.5, z);
      l.rotation.z = x * 0.12;
      l.rotation.x = -z * 0.12;
      g.add(l);
    });
    g.add(box(2.8, 0.18, 2.8, wm, 0, 3, 0));
    g.add(box(2.4, 1.6, 2.2, wm, 0, 3.9, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 4), rm);
    roof.position.y = 5.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    g.add(box(2.45, 0.9, 0.08, mat(0x87ceeb, 0.2, 0.2), 0, 4.05, 1.12));
    scene.add(g);
    g.updateMatrixWorld(true);
    // four slanted legs are what touch the ground (you can walk under the cabin between them)
    for (let i = 0; i < 4; i++) {
      const bp = g.children[i].localToWorld(V3(0, -1.5, 0));
      addCircle(bp.x, bp.z, 0.28, 3);
    }
  }
  // rocks + crates
  [
    [-34, 10],
    [36, 12],
    [-6, -24],
    [8, -8],
  ].forEach(([x, z]) => {
    const rr = rand(0.7, 1.3),
      r = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rr),
        mat(0x8d99ae, 0.9),
      );
    r.position.set(x, 0.5, z);
    r.castShadow = true;
    r.receiveShadow = true;
    scene.add(r);
    addCircle(x, z, rr * 0.88, 0.5 + rr);
  });
  [
    [4, -20],
    [5.2, -20],
    [-22, -26],
  ].forEach(([x, z]) => {
    const cr = box(1, 1, 1, mat(0xb08954, 0.85), x, 0.5, z);
    scene.add(cr);
    addBox(x, z, 0.5, 0.5, 0, 1);
  });
}
export function updateBeach(dt, t) {
  bonfireFlames.forEach((o) => {
    const sc = 1 + Math.sin(t * 11 + o.ph) * 0.22;
    o.f.scale.set(sc, sc * (1 + Math.sin(t * 13 + o.ph) * 0.18), sc);
  });
  sailboats.forEach((s) => {
    s.g.position.x += s.spd * dt;
    if (s.g.position.x > 120) s.g.position.x = -120;
    if (s.g.position.x < -120) s.g.position.x = 120;
    s.g.position.y = Math.sin(t * 1.2 + s.ph) * 0.18;
    s.g.rotation.z = Math.sin(t * 0.9 + s.ph) * 0.05;
    s.g.rotation.y = s.spd > 0 ? 0.15 : Math.PI - 0.15;
  });
}
const _bn = { x: 0, z: 0 };
function updateBalls(dt) {
  // beach balls: kick them by running into them; they roll, bounce off props and stay near the shore
  for (const b of balls) {
    const p = b.m.position,
      dx = p.x - player.pos.x,
      dz = p.z - player.pos.z,
      d = Math.hypot(dx, dz);
    if (d < 0.42 + PLAYER_R && d > 1e-4 && player.pos.y < 0.9) {
      const k = Math.max(3.2, player.speedNow * 1.25);
      b.vx = (dx / d) * k;
      b.vz = (dz / d) * k;
      p.x = player.pos.x + (dx / d) * (0.42 + PLAYER_R);
      p.z = player.pos.z + (dz / d) * (0.42 + PLAYER_R);
    }
    if (b.vx * b.vx + b.vz * b.vz < 0.0004) {
      b.vx = b.vz = 0;
    } else {
      p.x += b.vx * dt;
      p.z += b.vz * dt;
      const f = Math.exp(-1.7 * dt);
      b.vx *= f;
      b.vz *= f;
      if (resolveCollision(p, 0.42, _bn)) {
        const dot = b.vx * _bn.x + b.vz * _bn.z;
        if (dot < 0) {
          b.vx -= 1.6 * dot * _bn.x;
          b.vz -= 1.6 * dot * _bn.z;
        }
      }
      p.x = clamp(p.x, -52, 52);
      const lim = seaZ(p.x) + 0.4;
      if (p.z > lim) {
        p.z = lim;
        b.vz = -Math.abs(b.vz) * 0.5;
      }
      b.m.rotation.x += (b.vz * dt) / 0.42;
      b.m.rotation.z -= (b.vx * dt) / 0.42;
    }
  }
}

export { updateBalls };
