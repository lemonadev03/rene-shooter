import * as THREE from "three";
import { mat, box, cyl } from "../core/utils.js";

export function buildSolarSoaker() {
  const group = new THREE.Group();
  const gBody = mat(0xff7b1c, 0.35),
    gYellow = mat(0xffd23a, 0.35),
    gCoil = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0xff5500,
      emissiveIntensity: 1.8,
      roughness: 0.3,
    });
  group.add(box(0.14, 0.2, 0.58, gBody, 0, 0, 0.14));
  const barrel = cyl(0.09, 0.11, 0.3, gYellow, 0, 0.02, 0.55);
  barrel.rotation.x = Math.PI / 2;
  group.add(barrel);
  const lens = cyl(
    0.075,
    0.075,
    0.05,
    new THREE.MeshStandardMaterial({
      color: 0xffec99,
      emissive: 0xffaa00,
      emissiveIntensity: 2.2,
      roughness: 0.15,
    }),
    0,
    0.02,
    0.72,
  );
  lens.rotation.x = Math.PI / 2;
  group.add(lens);
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.018, 8, 18),
      gCoil,
    );
    coil.position.set(0, 0.02, 0.38 + i * 0.11);
    group.add(coil);
  } // glowing heat coils
  const cell = cyl(
    0.1,
    0.1,
    0.4,
    mat(0x123a7a, 0.3, 0.3, {
      transparent: true,
      opacity: 0.9,
      emissive: 0xffd23a,
      emissiveIntensity: 0.45,
    }),
    0,
    0.18,
    0.08,
  );
  cell.rotation.x = Math.PI / 2;
  group.add(cell); // solar charge cell
  for (let i = 0; i < 5; i++) {
    const fin = box(0.02, 0.16, 0.1, gYellow, (i - 2) * 0.045, 0.17, -0.12);
    fin.rotation.z = (i - 2) * 0.18;
    group.add(fin);
  } // sun-ray fins
  group.add(box(0.09, 0.22, 0.11, gBody, 0, -0.16, -0.05)); // grip
  group.add(box(0.1, 0.08, 0.3, mat(0x374151, 0.5), 0, -0.11, 0.28)); // under-rail
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.8);
  group.add(muzzle);

  return { group, muzzle };
}
