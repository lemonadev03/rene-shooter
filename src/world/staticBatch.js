import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const _defaultOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;
// Merges the rigid, opaque, untextured meshes among a group's direct children into one mesh per
// material definition. Call it at the end of a builder, passing every child that is animated,
// mutated or referenced later. Geometry from the shared cache in utils.js is cloned, never disposed.
function batchKey(child) {
  const material = child.material;
  if (Array.isArray(material)) {
    return null;
  }
  if (!material.isMeshStandardMaterial || material.transparent) {
    return null;
  }
  if (material.onBeforeCompile !== _defaultOnBeforeCompile) {
    return null;
  }
  if (Object.values(material).some((value) => value && value.isTexture)) {
    return null;
  }
  const definition = material.toJSON();
  delete definition.uuid;
  delete definition.metadata;
  const geometry = child.geometry;
  const signature = [
    geometry.index !== null,
    ...Object.keys(geometry.attributes).sort(),
  ];
  return JSON.stringify([
    definition,
    child.castShadow,
    child.receiveShadow,
    child.renderOrder,
    signature,
  ]);
}
export function mergeStaticChildren(group, exclude = []) {
  const skip = new Set(exclude);
  const buckets = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh || skip.has(child)) {
      continue;
    }
    const key = batchKey(child);
    if (key === null) {
      continue;
    }
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(child);
  }
  for (const members of buckets.values()) {
    if (members.length < 2) {
      continue;
    }
    const parts = members.map((child) => {
      child.updateMatrix();
      return child.geometry.clone().applyMatrix4(child.matrix);
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) {
      part.dispose();
    }
    if (!geometry) {
      continue;
    }
    const first = members[0];
    const merged = new THREE.Mesh(geometry, first.material);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    merged.matrixAutoUpdate = false;
    group.add(merged);
    for (const child of members) {
      group.remove(child);
      if (child.material !== first.material) {
        child.material.dispose();
      }
    }
  }
}
