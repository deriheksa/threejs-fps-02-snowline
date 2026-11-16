// SNOWLINE — the yard: the cable-yard floor at site B, cargo stacks, and
// the stencilled crate labels that make the map read as a working station.
import * as THREE from 'three';

function stencil(text, x, y, z, rotationY = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(text, 128, 32);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
  );
  plane.position.set(x, y, z);
  plane.rotation.y = rotationY;
  return plane;
}

export function yard(scene) {
  const crate = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 });
  const crateDark = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.6 });
  const add = (w, h, d, x, y, z, mat = crate) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // Cargo stacks in the yard and along the lanes.
  add(1.4, 1.2, 1.3, -12, 0.6, -13.5);
  add(1.4, 1.4, 1.2, -5, 0.7, -10.5);
  add(1.6, 1.5, 1.4, 2, 0.75, -13.3);
  add(1.4, 1.2, 1.3, -12, 0.6, 10.5);
  add(1.4, 1.4, 1.2, -5, 0.7, 13.4);
  add(1.6, 1.5, 1.4, 2, 0.75, 10.5);
  add(1.3, 1.2, 1, -6, 0.6, 1.5, crateDark);
  add(1.3, 1.2, 1, 2, 0.6, -1.5, crateDark);
  // Stencilled labels on the big crates.
  scene.add(stencil('SG-4', -12, 1.5, -12.8, Math.PI));
  scene.add(stencil('SG-4', -5, 1.7, -9.8, Math.PI));
  scene.add(stencil('KEEP DRY', 2, 1.8, -12.5, Math.PI));
  scene.add(stencil('SG-7', -12, 1.5, 11.2, 0));
  scene.add(stencil('KEEP DRY', 2, 1.8, 11.2, 0));
  scene.add(stencil('SNOWLINE', -6, 1.5, 2.05, 0));
  scene.add(stencil('LIFT 2', 2, 1.5, -2.05, Math.PI));
  // Cable spools in the yard.
  for (const [x, z] of [[10.7, -15], [10.7, 15]]) {
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16), steel);
    spool.rotation.x = Math.PI / 2;
    spool.position.set(x, 0.7, z);
    spool.castShadow = true;
    scene.add(spool);
  }
  // Fence posts marking the yard edge.
  for (let x = 9; x <= 17; x += 2) {
    add(0.12, 1.2, 0.12, x, 0.6, 8.2, steel);
    add(0.12, 1.2, 0.12, x, 0.6, -8.2, steel);
  }
}
