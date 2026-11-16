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

// View-model materials: the gun sits half a metre from the camera, so it
// has to read at a glance in blue hour. A pale steel body with almost no
// metalness — metal kills the diffuse and goes black under ACES tone
// mapping — plus a faint emissive lift keeps the receiver visible even in
// the lane shadows; the dark furniture is a mid grey for the same reason.
// The orange muzzle accent stays: it is the one warm note on the gun.
export function weaponModel(w, color = 0x39424e) {
  const group = new THREE.Group();
  // Dark slate, not pale grey: the map is snow, white crates and pale
  // walls, and a light-grey gun dissolved into them (it sat exactly over
  // the white crate in the Mid-lane fight shot). Dark slate reads against
  // snow and beige alike, and the camera fill light keeps it from going
  // pitch black the way the old dark receiver did.
  const body = new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.08,
    emissive: 0x39434d, emissiveIntensity: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x4d5860, roughness: 0.65, metalness: 0.1,
    emissive: 0x181d22, emissiveIntensity: 0.6,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xe09a2e, roughness: 0.45, metalness: 0.3,
    emissive: 0x7a4d10, emissiveIntensity: 0.4,
  });
  const add = (part, material = body) => {
    const [w, h, d, x, y, z] = part;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    // The view-model gun hangs off the camera, and the renderer culls it
    // anyway (its bounds sit right at the frustum's apex), so the weapon
    // silently vanishes from first-person screenshots. Camera children
    // are a handful of tiny boxes; always drawing them costs nothing.
    mesh.frustumCulled = false;
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
