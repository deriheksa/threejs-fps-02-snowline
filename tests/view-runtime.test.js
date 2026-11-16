// View runtime: a real scene, motion, ADS, weapon change, smoke lifecycle
// and spectator frames execute without JS errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.js';
import { createState } from '../game/state.js';
import { fire, damage } from '../game/combat.js';
import { startRound, step } from '../game/simulation.js';

test('view runtime: real scene, motion, ADS, weapon change, smoke lifecycle and spectator frames execute without JS errors', async () => {
  const real = new URL('../game/vendor/three/three.module.min.js', import.meta.url).href;
  const engine = 'data:text/javascript;base64,' + Buffer.from(
    `export * from ${JSON.stringify(real)};export let lastScene,lastCamera;` +
    `export class WebGLRenderer{constructor(){this.shadowMap={};this.domElement=document.createElement('canvas');}` +
    `setSize(){}setPixelRatio(){}render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);lastScene=scene;lastCamera=camera;}}`,
  ).toString('base64');
  function canvas() {
    const c = { width: 128, height: 128, style: {} };
    const ctx = new Proxy(
      { canvas: c, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
      { get: (o, k) => k in o ? o[k] : () => {} },
    );
    c.getContext = () => ctx;
    return c;
  }
  const elements = new Map();
  globalThis.document = {
    createElement: canvas,
    body: { appendChild() {} },
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, id === 'radar' || id === 'map' ? canvas() : {
          style: {}, hidden: false, innerHTML: '', textContent: '',
          classList: { add() {}, remove() {}, toggle() {} },
          querySelectorAll: () => [],
        });
      }
      return elements.get(id);
    },
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  const { view } = await loadModule('view.js', engine);
  const s = createState();
  const input = { yaw: 0, pitch: 0, aim: false };
  const v = view(s, { fov: 74, crosshair: '#9fe8ff', snow: true, radarUp: false });
  v.frame(input, 0);
  startRound(s);
  s.phase = 'live';
  s.timer = 100;
  const api = await import(engine);
  for (let i = 1; i < 90; i++) {
    input.aim = i > 20 && i < 40;
    input.sprint = i < 20;
    input.moveZ = i < 55 ? -1 : 0;
    input.moveX = i > 20 && i < 50 ? 0.5 : 0;
    input.jumpPressed = i === 15;
    input.yaw = Math.sin(i / 8) * 0.15;
    if (i % 10 === 0 && i < 65) fire(s, s.actors[0], input.yaw, 0);
    if (i === 25) damage(s, s.actors[0], 15, s.actors[5]);
    input.crouch = i > 60;
    if (i === 10) v.setWeapon(4);
    if (i === 30) s.smokes = [{ x: -18, z: -4, life: 15 }];
    if (i === 45) s.smokes = [];
    if (i === 50) s.actors[0].reload = 1;
    if (i === 70) { s.actors[0].alive = false; s.actors[0].w = 4; input.aim = true; }
    step(s, input);
    v.frame(input, i / 60);
    assert.ok(api.lastCamera.fov >= 27 && api.lastCamera.fov <= 91);
    for (const n of api.lastCamera.matrixWorld.elements) assert.ok(Number.isFinite(n));
  }
  const { lastScene, lastCamera } = await import(engine);
  assert.ok(lastCamera.fov > 65, 'spectator must not inherit dead player scope zoom');
  let finite = true;
  lastScene.traverse((o) => {
    if (o.isObject3D) {
      for (const n of o.matrixWorld.elements) if (!Number.isFinite(n)) finite = false;
    }
  });
  assert.ok(finite);
  assert.ok(lastScene.children.length > 30);
  assert.equal(document.getElementById('hud').hidden, false);
});
