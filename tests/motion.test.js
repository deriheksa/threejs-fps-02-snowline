// Presentation springs, walk gait, smoke vision, and air movement.
import { fire } from '../game/combat.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spring, stridePose, viewMotion, smokeBlocks } from '../game/motion.js';
import { createState } from '../game/state.js';
import { playerMotion } from '../game/simulation.js';

test('smoke: line intersection detects near-end smoke that midpoint-only vision missed', () => {
  assert.ok(smokeBlocks([{ x: 1, z: 0, life: 15 }], 0, 0, 20, 0));
  assert.equal(smokeBlocks([{ x: 10, z: 4, life: 15 }], 0, 0, 20, 0), false);
  assert.equal(smokeBlocks([{ x: 1, z: 0, life: 0 }], 0, 0, 20, 0), false);
});

test('camera springs: recoil recovers, ADS eases and irregular frames stay finite', () => {
  const update = viewMotion();
  const a = { vx: 3, vz: 0, grounded: true, lastShot: 0, w: 2 };
  const input = { yaw: 0, aim: false };
  const rest = update(a, input, 1 / 60);
  a.lastShot = 1;
  const kick = update(a, input, 1 / 60);
  assert.ok(kick.kick > rest.kick);
  input.aim = true;
  const first = update(a, input, 1 / 60);
  assert.ok(first.ads > 0 && first.ads < 1);
  for (let i = 0; i < 300; i++) {
    const f = update(a, input, i % 7 === 0 ? 0.05 : 1 / 120);
    for (const n of Object.values(f)) assert.ok(Number.isFinite(n));
  }
  const settled = update(a, input, 1 / 60);
  assert.ok(settled.kick < 0.001);
  assert.ok(settled.ads > 0.99);
});

test('gait: planted phase has zero lift; swing raises the foot with no positional discontinuity', () => {
  const p = stridePose(0.3, 0.3, 0.15);
  assert.equal(p.lift, 0);
  const swing = stridePose(Math.PI * 1.7, 0.3, 0.15);
  assert.ok(swing.lift > 0.05);
  for (let x = 0; x < 20; x += 0.01) {
    const q = stridePose(x, 0.4, 0.2);
    assert.ok(Math.abs(q.travel) <= 0.4 && q.lift >= 0 && q.lift <= 0.2);
  }
});

test('air movement: jumping retains momentum and does not instantly reverse like grounded movement', () => {
  const a = createState().actors[0];
  Object.assign(a, { x: -18, z: 0, y: 0.5, vy: 2, grounded: false, vx: 3.7, vz: 0 });
  playerMotion(a, { yaw: 0, left: true }, 1 / 60);
  assert.ok(a.vx > 3);
  assert.equal(a.grounded, false);
});

test('jump shots: fire remains available while airborne, with clearly larger spread than on the ground', () => {
  const spreadOf = (air) => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const s = createState(71 + i);
      s.phase = 'live';
      const a = s.actors[0];
      a.grounded = !air;
      a.y = air ? 0.7 : 0;
      assert.ok(fire(s, a, 0.25, 0));
      const e = s.effects[0];
      total += Math.abs(Math.atan2(-(e.ex - a.x), -(e.ez - a.z)) - 0.25);
    }
    return total / 20;
  };
  assert.ok(spreadOf(true) > spreadOf(false) * 3);
});
