// Render stability: bodies never overlap the camera, overlapping actors
// can separate, and a dead player's scope zoom never leaks into spectator view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../game/state.js';
import { moveAmong } from '../game/simulation.js';
import { safeBodyVisible, spectatorFov } from '../game/camera-policy.js';

test('body collision: walking into another character cannot put the FPP camera inside their body', () => {
  const s = createState(), p = s.actors[0], b = s.actors[1];
  for (const a of s.actors) if (a !== p && a !== b) a.alive = false;
  Object.assign(p, { x: -18, z: 0, y: 0 });
  Object.assign(b, { x: -17, z: 0, y: 0 });
  for (let i = 0; i < 60; i++) moveAmong(s, p, 0.05, 0);
  assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= 0.68 - 1e-8);
  assert.ok(p.x < -17.6);
});

test('overlap recovery: initially overlapping actors can separate instead of locking movement', () => {
  const s = createState(), p = s.actors[0], b = s.actors[1];
  for (const a of s.actors) if (a !== p && a !== b) a.alive = false;
  Object.assign(p, { x: -18, z: 0, y: 0 });
  Object.assign(b, { x: -18, z: 0, y: 0 });
  moveAmong(s, p, -0.1, 0);
  assert.ok(p.x < -18);
});

test('death camera: held DMR aim cannot leak a 28-degree scope into spectator view', () => {
  assert.equal(spectatorFov({ alive: false, w: 4 }, true, 72), 72);
  assert.equal(spectatorFov({ alive: true, w: 4 }, true, 72), 28);
  assert.equal(safeBodyVisible({ x: 0, z: 0, y: 0 }, { x: 0, z: 0, y: 1.6 }), false);
  assert.equal(safeBodyVisible({ x: 1, z: 0, y: 0 }, { x: 0, z: 0, y: 1.6 }), true);
});
