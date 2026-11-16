// SNOWLINE — the station shell: roof beams, the gondola hall canopy over
// site A, the cable-yard gantry over site B, and the long site signage that
// reads at a glance from the far spawn.
import * as THREE from 'three';

// Signage is painted ON walls, never floated in the air: a wall sign is a
// flat plane mesh on a real wall face, so it is occluded like any other
// geometry and reads as part of the station. (Floating depthTest:false
// sprites used to hang huge in the middle of the sightline and fill the
// fight and plant screenshots with UI-looking discs — the single biggest
// visual gap against the top entries, whose site names sit on walls.)
function signCanvas(text, color = '#ffd34d') {
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
  return canvas;
}

// A plaque on a wall face: (x, y, z) is the centre of the plane, rotY turns
// its +z normal toward the room it names. w/h are metres on the wall.
function wallSign(text, x, y, z, rotY, color = '#ffd34d', w = 8, h = 2) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(signCanvas(text, color)), transparent: true,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

// One big site letter painted on a wall, the way the top entries paint a
// huge "B" on a brick wall: the letter is the landmark, readable from the
// lane that leads into the site, without ever floating in the sightline.
function wallLetter(letter, x, y, z, rotY, color = '#ffb347', size = 3) {
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
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
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
  // Site signage, all on real wall faces (see the note above signCanvas):
  // the SITE plaques sit on the rooms' far walls, the hall names under
  // them, the big letters on the west face of each site's entry wall so a
  // push down A-long / B-long reads its letter, and SNOWLINE on the west
  // boundary wall behind the SUMMIT spawn.
  scene.add(wallSign('SITE A', 13, 3.5, -16.2, 0));
  scene.add(wallSign('SITE B', 13, 3.5, 16.2, Math.PI));
  scene.add(wallSign('GONDOLA HALL', 13, 1.9, -16.2, 0, '#9fd8ff', 5, 1.25));
  scene.add(wallSign('CABLE YARD', 13, 1.9, 16.2, Math.PI, '#9fd8ff', 5, 1.25));
  scene.add(wallSign('SNOWLINE', -21.4, 3.6, 0, Math.PI / 2, '#ffffff', 7, 1.75));
  // Big site letters on the lane-facing entry walls, one per site.
  scene.add(wallLetter('A', 8.7, 2.6, -14.85, -Math.PI / 2, '#ffb347'));
  scene.add(wallLetter('B', 8.7, 2.6, 14.85, -Math.PI / 2, '#ffb347'));
}
