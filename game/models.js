// SNOWLINE — first-person weapon models.
// Each gun is a small group of boxes built from the same voxel language as
// the soldiers: receiver, barrel, grip, stock and magazine, plus a sight on
// the DMR. Colours match the team of the holder.
import * as THREE from 'three';

const PART = {
  receiver: [0.5, 0.11, 0.11, 0, 0, 0],
  barrel: [0.4, 0.07, 0.07, 0.42, 0.01, 0],
  grip: [0.09, 0.16, 0.09, -0.08, -0.12, 0],
  stock: [0.26, 0.1, 0.09, -0.33, 0.01, 0],
  mag: [0.09, 0.2, 0.07, 0.05, -0.14, 0],
  sight: [0.1, 0.07, 0.07, 0.12, 0.09, 0],
};

// Build the view model for weapon index w (0..4). group is positioned by
// view.js each frame (ADS, recoil, reload sway).
export function weaponModel(w, color = 0x2c3138) {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.7, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc9802a, roughness: 0.5, metalness: 0.4 });
  const add = (part, material = body) => {
    const [w, h, d, x, y, z] = part;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  // Per-weapon silhouettes, scaled from a shared parts table.
  const shapes = [
    // Pika P9 — compact pistol.
    [[0.2, 0.07, 0.07, 0.15, 0.02, 0], [0.08, 0.13, 0.07, -0.02, -0.07, 0]],
    // Marmot SMG — short, fat, big mag.
    [[0.42, 0.1, 0.1, 0.05, 0, 0], [0.28, 0.06, 0.06, 0.35, 0.01, 0], [0.1, 0.22, 0.08, 0.08, -0.14, 0]],
    // Ibex AR — the all-rounder.
    [PART.receiver, PART.barrel, PART.grip, PART.stock, PART.mag],
    // Lynx-12 — wide pump shotgun.
    [[0.55, 0.13, 0.12, 0.08, 0, 0], [0.3, 0.09, 0.09, 0.42, 0, 0], [0.2, 0.07, 0.07, -0.28, -0.01, 0], [0.09, 0.15, 0.08, -0.06, -0.1, 0]],
    // Chamois DMR — long barrel, scope, bipod.
    [[0.5, 0.11, 0.11, 0, 0, 0], [0.55, 0.06, 0.06, 0.5, 0.01, 0], PART.sight, PART.stock, PART.mag],
  ];
  for (const part of shapes[w] || shapes[2]) add(part);
  add([0.06, 0.05, 0.05, 0.28, 0.02, 0], accent); // muzzle accent
  return group;
}
