// SNOWLINE — station dressing: benches, signs, ticket booth, ski racks,
// crates and cable wheels. Small props that make the lanes read as a place,
// not a grey box. Every prop here is visual only — collision comes from
// terrain.js.
import * as THREE from 'three';

function sign(text, x, y, z, color = '#e8eef2') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true,
  }));
  sprite.scale.set(2, 0.5, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

export function stationDetail(scene) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.5, metalness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb04030, roughness: 0.6, metalness: 0.2 });
  const add = (w, h, d, x, y, z, mat = wood) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // Benches along the lanes.
  for (const [x, z] of [[-14, -6], [-4, -6], [4, -6], [-14, 6], [-4, 6], [4, 6]]) {
    add(2.2, 0.12, 0.6, x, 0.5, z);
    add(0.12, 0.5, 0.6, x - 1, 0.25, z);
    add(0.12, 0.5, 0.6, x + 1, 0.25, z);
  }
  // Ticket booth near the SUMMIT spawn.
  add(2, 2.6, 2, -20, 1.3, -10, steel);
  add(2.2, 0.15, 2.2, -20, 2.7, -10, red);
  scene.add(sign('TICKETS', -20, 3.1, -10, '#ffd34d'));
  // Ski rack near the VALE spawn.
  for (let i = 0; i < 5; i++) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.3),
      new THREE.MeshStandardMaterial({ color: [0xd04040, 0x4080d0, 0x40a050, 0xe0a030, 0x8040a0][i], roughness: 0.5 }));
    ski.position.set(-20, 0.9, 10.2 + i * 0.4);
    ski.rotation.z = 0.3;
    scene.add(ski);
  }
  // Cable wheels on the site B towers.
  for (const x of [11, 15]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.18, 10, 24), steel);
    wheel.position.set(x, 6.2, 14);
    wheel.castShadow = true;
    scene.add(wheel);
  }
  // The red gondola cabin at site A.
  const cabin = add(4.8, 2.2, 2.6, 13, 2.2, -13, red);
  cabin.rotation.y = 0;
  add(5.2, 0.2, 3, 13, 3.4, -13, steel); // roof
  add(0.3, 1.2, 0.3, 13, 4.2, -13, steel); // hanger arm
  scene.add(sign('GONDOLA 07', 13, 4.9, -13, '#ffffff'));
  scene.add(sign('A-LONG →', -8, 3.2, -13.5, '#9fd8ff'));
  scene.add(sign('← B-LONG', -8, 3.2, 13.5, '#9fd8ff'));
  scene.add(sign('MID', 0, 3.2, 0, '#9fd8ff'));
}
