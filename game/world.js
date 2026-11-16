// SNOWLINE — the 3D scene: lights, sky, mountains, snow, and the arena
// built from the single geometry list in terrain.js. The dressing modules
// (architecture, ridge, station-detail, alpine, yard) add the station's
// visual detail on top; this file owns the render loop's shared pieces.
import * as THREE from 'three';
import { cover } from './terrain.js';
import { batchMeshes } from './geometry.js';
import { architecture } from './architecture.js';
import { ridgeArchitecture } from './ridge-architecture.js';
import { stationDetail } from './station-detail.js';
import { alpine } from './alpine.js';
import { yard } from './yard.js';

// Procedural canvas texture: a subtle noise pattern used on snow and concrete.
export function texture(name, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (name === 'snow') {
    ctx.fillStyle = '#e8eef2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${180 + Math.random() * 60 | 0}, ${190 + Math.random() * 50 | 0}, ${200 + Math.random() * 40 | 0}, 0.5)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  } else {
    ctx.fillStyle = '#7a7d80';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Build the whole scene once. Returns the pieces view.js needs: the scene,
// the snow particle system, and a per-frame updater.
export function world() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2a3a);
  scene.fog = new THREE.Fog(0x1a2a3a, 30, 90);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x2a2a30, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(-30, 40, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
  fill.position.set(25, 15, 25);
  scene.add(fill);

  // Ground: snow plane with a subtle procedural texture.
  const snowTex = texture('snow');
  snowTex.repeat.set(12, 10);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 100),
    new THREE.MeshStandardMaterial({ map: snowTex, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // The arena walls and props, batched into a few meshes.
  const concrete = new THREE.MeshStandardMaterial({
    map: texture('concrete'), roughness: 0.9, metalness: 0.05,
  });
  const batched = batchMeshes(cover.map((p) => ({
    x: p.x, y: p.h / 2, z: p.z, w: p.w, h: p.h, d: p.d,
  })));
  if (batched) {
    const mesh = new THREE.Mesh(batched, concrete);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Dressing layers.
  architecture(scene);
  ridgeArchitecture(scene);
  stationDetail(scene);
  alpine(scene);
  yard(scene);

  // Snowfall: 1200 points drifting down inside a 60 m box.
  const snowCount = 1200;
  const positions = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = Math.random() * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.08, transparent: true, opacity: 0.85,
  }));
  scene.add(snow);

  return {
    scene,
    update(dt, showSnow) {
      snow.visible = showSnow;
      if (!showSnow) return;
      const pos = snow.geometry.attributes.position;
      for (let i = 0; i < snowCount; i++) {
        let y = pos.getY(i) - dt * 1.5;
        if (y < 0) y = 20;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(Date.now() * 0.001 + i) * dt * 0.2);
      }
      pos.needsUpdate = true;
    },
  };
}
