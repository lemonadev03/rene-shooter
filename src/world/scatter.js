import * as THREE from "three";
import { scene, colliders } from "../core/state.js";
import { loadGLTF, trackAssetTask } from "../core/assets.js";
import { addBox } from "../core/collision.js";
import { quality } from "../core/quality.js";
import { shoreZ, bedY } from "./ocean.js";

const batches = [];
const footprints = [];
let previousTier;
export function updateScatterQuality() {
  if (previousTier === quality.tier) return;
  previousTier = quality.tier;
  for (const { mesh, fixed, count } of batches)
    mesh.count = fixed + Math.ceil((count - fixed) * (quality.tier === "low" ? .5 : 1));
  for (const entry of footprints) {
    const active = entry.index < entry.fixed + Math.ceil((entry.count - entry.fixed) * (quality.tier === "low" ? .5 : 1));
    if (active === entry.active) continue;
    if (active) colliders.push(entry.collider);
    else colliders.splice(colliders.indexOf(entry.collider), 1);
    entry.active = active;
  }
}

// Compensate foliage coverage lost to mesh simplification by widening each
// disconnected leaf card about its own centre, without adding any vertices.
function broadenLeaves(geometry) {
  const p = geometry.attributes.position, index = geometry.index;
  const parent = new Int32Array(p.count).map((_, i) => i);
  const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < index.count; i += 3) {
    const a = root(index.getX(i)), b = root(index.getX(i + 1)), c = root(index.getX(i + 2));
    parent[b] = a; parent[c] = a;
  }
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const id = root(i);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(i);
  }
  for (const vertices of groups.values()) {
    if (vertices.length < 3) continue;
    const center = new THREE.Vector3();
    for (const i of vertices) center.add(new THREE.Vector3().fromBufferAttribute(p, i));
    center.multiplyScalar(1 / vertices.length);
    for (const i of vertices) p.setXYZ(i, center.x + (p.getX(i) - center.x) * 2.3, center.y + (p.getY(i) - center.y) * 2.3, center.z + (p.getZ(i) - center.z) * 2.3);
  }
}

export function initScatter() {
  return trackAssetTask("beach-scans", (async () => {
    const ids = ["boulder_01", "coast_rocks_02", "coast_rocks_05", "sand_rocks_small_01", "lambis_shell", "grass_bermuda_01", "fern_02", "island_tree_01", "island_tree_02", "island_tree_03"];
    const gltfs = await Promise.all(ids.map((id) => loadGLTF(new URL(`../../assets/beach/${id}.glb`, import.meta.url).href)));
    const models = new Map(ids.map((id, i) => [id, gltfs[i].scene]));
    let seed = 251103;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const range = (a, b) => a + random() * (b - a);
    const rockColliders = [];
    const record = (x, z, sx, sy, sz, solid = false, y = bedY(x, z) - .04) => ({ x, y, z, sx, sy, sz, yaw: range(0, Math.PI * 2), solid });
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3(), scale = new THREE.Vector3();

    // Each scan is baked into a unit bounding box once. Instances and their
    // oriented footprints share precisely the same dimensions and yaw.
    function batch(id, records, shadow = false, fixed = 0, rock = false) {
      if (!records.length) return;
      const model = models.get(id);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const meshes = [];
      model.traverse((part) => {
        if (!part.isMesh) return;
        const geometry = part.geometry.clone();
        // Meshopt uses normalized integer positions. Expand before baking world
        // transforms so BufferAttribute setters cannot clamp them to [-1,1].
        const source = geometry.attributes.position, vertices = new Float32Array(source.count * 3);
        for (let i = 0; i < source.count; i++) {
          vertices[i * 3] = source.getX(i); vertices[i * 3 + 1] = source.getY(i); vertices[i * 3 + 2] = source.getZ(i);
        }
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        if (part.material.name.includes("leaves")) broadenLeaves(geometry);
        geometry.applyMatrix4(part.matrixWorld);
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
        const material = part.material.clone();
        if (material.transparent) {
          material.transparent = false;
          material.alphaTest = .25;
          material.depthWrite = true;
          // The staged leaf atlases have black RGB outside the leaves instead
          // of an alpha channel. Restore the cutout before alpha testing.
          material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a*=smoothstep(.015,.06,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));diffuseColor.rgb*=vec3(1.15,1.35,1.05);");
          };
          material.customProgramCacheKey = () => "beach-leaf-cutout-1";
          material.emissiveMap = material.map;
          material.emissive.setRGB(.08, .12, .04);
        }
        if (rock) {
          material.color.multiplyScalar(.78);
          material.onBeforeCompile = (shader) => {
            shader.vertexShader = "varying vec3 vRockWorld;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvRockWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;");
            shader.fragmentShader = "varying vec3 vRockWorld;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfloat rockWet=1.-smoothstep(.05,.85,vRockWorld.y);roughnessFactor=mix(roughnessFactor,.27,rockWet);diffuseColor.rgb*=mix(1.,.48,rockWet);");
          };
          material.customProgramCacheKey = () => "beach-wet-rock-1";
        }
        const mesh = new THREE.InstancedMesh(geometry, material, records.length);
        mesh.name = `beach/${id}`;
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        records.forEach((r, i) => {
          position.set(r.x, r.y, r.z); scale.set(r.sx, r.sy, r.sz); rotation.setFromAxisAngle(axis, r.yaw);
          matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        batches.push({ mesh, fixed, count: records.length });
        scene.add(mesh);
        meshes.push(mesh);
      });
      records.forEach((r, index) => {
        if (!r.solid) return;
        addBox(r.x, r.z, r.sx * .46, r.sz * .46, r.yaw, r.y + r.sy, Math.max(-1.5, r.y));
        footprints.push({ collider: colliders[colliders.length - 1], index, fixed, count: records.length, active: true });
        rockColliders.push({ ...r, hx: r.sx * .46, hz: r.sz * .46 });
      });
      return meshes;
    }

    // Four gameplay props retain their original locations; all have a measured footprint.
    const boulders = [record(-34, 10, 2.2, 1.5, 1.8, true), record(-6, -24, 1.9, 1.35, 1.65, true), record(8, -8, 1.8, 1.4, 1.6, true)];
    const ledges = [record(36, 12, 2.7, 1.55, 2.1, true)];
    for (let i = 0; i < 16; i++) {
      const x = (i % 2 ? -1 : 1) * range(47, 70), z = range(-4, 25), w = range(2.5, 6);
      (i % 3 ? ledges : boulders).push(record(x, z, w, range(1.1, 3.2), w * range(.65, .95), true));
    }
    batch("boulder_01", boulders.slice(0, 3), true, 3, true);
    batch("boulder_01", boulders.slice(3), false, 0, true);
    batch("coast_rocks_05", ledges.slice(0, 1), true, 1, true);
    batch("coast_rocks_05", ledges.slice(1), false, 0, true);
    const shoreRocks = [];
    for (let i = 0; i < 13; i++) {
      const x = -57 + i * 9.3 + range(-1.4, 1.4), z = shoreZ(x) + range(-.1, 3.4), w = range(1.3, 3.4);
      shoreRocks.push(record(x, z, w, w * .16, w * .7, true, bedY(x, z) - w * .045));
    }
    batch("coast_rocks_02", shoreRocks, false, 0, true);
    const pebbles = [], shells = [];
    for (let i = 0; i < 48; i++) {
      const x = range(-49, 49), z = i < 32 ? shoreZ(x) - range(1.5, 8) : range(-34, 10), w = range(.08, .23);
      pebbles.push(record(x, z, w, w * .34, w * .8));
    }
    for (let i = 0; i < 24; i++) {
      const x = range(-48, 48), z = shoreZ(x) - range(2, 13), w = range(.075, .17);
      shells.push(record(x, z, w, w * .38, w * .8));
    }
    batch("sand_rocks_small_01", pebbles);
    batch("lambis_shell", shells);
    const grass = [], ferns = [];
    for (let i = 0; i < 72; i++) {
      const x = range(-64, 64), z = range(-48, -35), w = range(.65, 1.5);
      grass.push(record(x, z, w, range(.3, .65), w, false, .02));
    }
    for (let i = 0; i < 24; i++) {
      const x = range(-64, 64), z = range(-49, -39), w = range(.9, 1.8);
      ferns.push(record(x, z, w, range(.55, 1.2), w, false, .02));
    }
    // Narrow spatial batches keep their bounding spheres behind the camera
    // when facing the ocean; a single beach-wide sphere straddles the player.
    const duneBatches = (id, records) => {
      for (let i = 0; i < 3; i++) batch(id, records.filter((r) => Math.min(2, Math.floor((r.x + 75) / 50)) === i));
    };
    duneBatches("grass_bermuda_01", grass);
    duneBatches("fern_02", ferns);

    // Facing the ocean (+Z), negative X is screen-right. A continuous ridge
    // joins the right beach end and tapers into the horizon, beyond player reach.
    const cliffs = [], trees = [[], [], []], duneTrees = [[], [], []];
    for (let i = 0; i < 9; i++) {
      const x = -70 - i * 8, z = 38 + i * 9, h = 7 + Math.sin(i / 8 * Math.PI) * 12;
      const r = record(x, z, 36, h, 31, false, -1.4); r.yaw = -.55;
      cliffs.push(r);
      for (let j = 0; j < 3; j++) {
        const height = range(6, 10), tx = x + range(-11, 11), tz = z + range(-7, 6);
        trees[(i + j) % 3].push(record(tx, tz, height, height, height * .85, false, h - 1.8));
      }
    }
    // The cliff scan's thin cropped edges stretch into blades at headland scale;
    // overlapping coastal outcrops retain a rounded, photographed silhouette.
    const headland = batch("coast_rocks_05", cliffs, false, 0, true);
    headland.forEach((mesh) => { mesh.updateMatrixWorld(true); mesh.material.envMapIntensity = 1.6; });
    const down = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    for (const tree of trees.flat()) {
      down.ray.origin.set(tree.x, 60, tree.z);
      const hits = down.intersectObjects(headland, false);
      if (hits.length) tree.y = hits[0].point.y - .15;
    }
    for (let i = 0; i < 42; i++) {
      const x = -73 + i * 3.5, z = range(-58, -49), height = range(7, 12);
      duneTrees[i % 3].push(record(x, z, height * .8, height, height * .75, false, -.1));
    }
    trees.forEach((records, i) => batch(`island_tree_0${i + 1}`, records));
    duneTrees.forEach((records, i) => duneBatches(`island_tree_0${i + 1}`, records));
    scene.userData.beach = { rockColliders, scatter: batches.map(({ mesh, count }) => ({ type: mesh.name, count })) };
    previousTier = undefined;
    updateScatterQuality();
  })());
}
