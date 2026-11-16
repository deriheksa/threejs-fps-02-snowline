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
    ctx.fillStyle = '#c9d3da';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${165 + Math.random() * 55 | 0}, ${175 + Math.random() * 50 | 0}, ${185 + Math.random() * 45 | 0}, 0.5)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  } else {
    ctx.fillStyle = '#9aa0a3';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.12})`;
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
  // Blue-hour sky: a gradient dome instead of a flat colour. The amber band
  // sits at the horizon so the station reads warm against cold blue, the
  // way the top-ranked entries grade their maps (orange dusk, purple
  // dusk, bright daylight) instead of flat grey-blue.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx?.createLinearGradient?.(0, 0, 0, 512);
  if (skyGrad && typeof skyGrad.addColorStop === 'function') {
    skyGrad.addColorStop(0.00, '#101d33');
    skyGrad.addColorStop(0.30, '#2c4a6b');
    skyGrad.addColorStop(0.42, '#6b5a68');
    skyGrad.addColorStop(0.47, '#e8862e');
    skyGrad.addColorStop(0.50, '#f5a54a');
    skyGrad.addColorStop(1.00, '#8a6f5c');
    skyCtx.fillStyle = skyGrad;
    skyCtx.fillRect(0, 0, 4, 512);
  } else if (skyCtx) {
    skyCtx.fillStyle = '#35597a';
    skyCtx.fillRect(0, 0, 4, 512);
  }
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false,
    }),
  );
  scene.add(skyDome);
  scene.background = new THREE.Color(0x101d33);
  scene.fog = new THREE.Fog(0x8a7a6e, 45, 120);

  const hemi = new THREE.HemisphereLight(0x9db8d8, 0x51403a, 1.15);
  scene.add(hemi);
  // Low amber sun, raking across the lanes so shadows stretch long and the
  // snow and walls pick up warm rims. High noon light was flattening the
  // whole map into grey.
  const sun = new THREE.DirectionalLight(0xffb347, 1.9);
  sun.position.set(-38, 16, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7a9cc8, 0.6);
  fill.position.set(25, 15, 25);
  scene.add(fill);
  // Warm pools of station light over both sites, so the objectives glow
  // amber against the cold lanes.
  for (const [lx, lz] of [[13, -10], [13, 11]]) {
    const lamp = new THREE.PointLight(0xffa040, 30, 18, 2);
    lamp.position.set(lx, 5, lz);
    scene.add(lamp);
  }

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
  // Soft round flake texture so near-camera flakes read as snow, not
  // squares. Built defensively: if the 2D canvas API is unavailable or
  // incomplete (headless stubs), the snow falls back to plain points.
  let flakeMap = null;
  const flakeCanvas = document.createElement('canvas');
  flakeCanvas.width = flakeCanvas.height = 32;
  const fctx = flakeCanvas.getContext('2d');
  const grad = fctx?.createRadialGradient?.(16, 16, 0, 16, 16, 16);
  if (grad && typeof grad.addColorStop === 'function') {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 32, 32);
    flakeMap = new THREE.CanvasTexture(flakeCanvas);
  }
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85,
    ...(flakeMap ? { map: flakeMap } : {}), depthWrite: false,
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
