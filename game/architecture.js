// SNOWLINE — the station shell: roof beams, the gondola hall canopy over
// site A, the cable-yard gantry over site B, and the long site signage that
// reads at a glance from the far spawn.
import * as THREE from 'three';

function label(text, x, y, z, color = '#ffd34d', size = 2.2) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Dark plaque behind the letters: bare glowing text dissolved into the
  // pale walls and snow at a glance. The plaque makes the sign read as a
  // sign, like the top entries' big wall boards.
  ctx.fillStyle = 'rgba(8, 12, 16, 0.88)';
  ctx.fillRect(6, 10, 500, 108);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 14, 492, 100);
  ctx.font = 'bold 72px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false,
  }));
  sprite.scale.set(size * 4, size, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

// One giant site letter on a dark disc, the way the top entries paint a
// huge "B" on a brick wall: the letter is the landmark, readable from the
// far spawn without squinting.
function giantLetter(letter, x, y, z, color = '#ffb347') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(8, 12, 16, 0.85)';
  ctx.beginPath();
  ctx.ellipse(128, 128, 120, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(128, 128, 112, 112, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = 'bold 170px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(letter, 128, 136);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false,
  }));
  sprite.scale.set(5, 5, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

export function architecture(scene) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.6 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85, metalness: 0 });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffb84d, emissive: 0xff9a1a, emissiveIntensity: 0.8, roughness: 0.4,
  });
  const add = (w, h, d, x, y, z, mat = steel) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // Roof beams spanning the whole station, every 6 m.
  for (let x = -20; x <= 20; x += 6) add(0.5, 0.6, 36, x, 5.6, 0, timber);
  // Gondola hall canopy over site A (red gondola below).
  add(10, 0.4, 9, 13, 5.2, -12, timber);
  add(0.4, 2.2, 9, 8.2, 4.2, -12, steel);
  add(0.4, 2.2, 9, 17.8, 4.2, -12, steel);
  // Cable-yard gantry over site B.
  add(10, 0.5, 8, 13, 6.4, 12, steel);
  add(0.5, 2.4, 0.5, 11, 5.2, 12, steel);
  add(0.5, 2.4, 0.5, 15, 5.2, 12, steel);
  // Warm lamps along both lanes.
  for (const z of [-12, 0, 12]) {
    for (const x of [-15, -5, 5, 15]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), amber);
      lamp.position.set(x, 4.6, z);
      scene.add(lamp);
    }
  }
  // Big site signage.
  scene.add(label('SITE A', 13, 6.8, -12));
  scene.add(label('SITE B', 13, 7.6, 12));
  scene.add(label('GONDOLA HALL', 13, 5.6, -16.2, '#9fd8ff', 1.4));
  scene.add(label('CABLE YARD', 13, 5.6, 16.2, '#9fd8ff', 1.4));
  scene.add(label('SNOWLINE', -20.5, 6.5, 0, '#ffffff', 1.6));
  // Giant site letters on the lane-facing walls, one per site.
  scene.add(giantLetter('A', 8.6, 3.4, -12, '#ffb347'));
  scene.add(giantLetter('B', 8.6, 3.4, 12, '#ffb347'));
}
