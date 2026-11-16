// Core simulation: determinism, shooting, plant/defuse, economy, and the
// regressions that caught real bugs in earlier builds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createState, buy, sites } from '../game/state.js';
import { step, startRound, move, interact, endRound, playerMotion } from '../game/simulation.js';
import { fire, reload } from '../game/combat.js';

describe('simulation', () => {
  test('two seeded matches step identically; buy phase becomes live; walls stop movement; round 12 ends the match', () => {
    const a = createState(), b = createState();
    startRound(a);
    startRound(b);
    for (let i = 0; i < 1000; i++) { step(a, { yaw: 0 }); step(b, { yaw: 0 }); }
    assert.deepEqual(a, b);
    assert.equal(a.phase, 'live');
    const p = a.actors[0];
    p.x = -21; p.z = 0;
    move(p, -10, 0);
    assert.ok(p.x > -21.2 && p.x <= -21);
    a.round = 12;
    startRound(a);
    assert.equal(a.phase, 'over');
  });
});

describe('shooting reduces enemy HP', () => {
  test('a shot spends one round and wounds the target; reload refills the magazine', () => {
    const s = createState();
    s.phase = 'live';
    const a = s.actors[0], b = s.actors[5];
    a.x = -20; a.z = -2;
    b.x = -20; b.z = -7;
    for (const c of s.actors.slice(1)) if (c !== b) c.alive = false;
    const hp = b.hp;
    assert.ok(fire(s, a, 0));
    assert.ok(b.hp < hp);
    assert.equal(a.ammo, 14);
    assert.equal(fire(s, a, 0), false); // still cooling down
    reload(a);
    for (let i = 0; i < 130; i++) step(s, { yaw: 0 });
    assert.ok(a.ammo > 0);
  });
});

describe('plant and defuse flow', () => {
  test('planting arms the charge, a kitted defender clears it, and a spent fuse awards the attackers', () => {
    const s = createState();
    s.phase = 'live';
    s.timer = 100;
    const p = s.actors[0];
    Object.assign(p, sites[0]);
    for (let i = 0; i < 181; i++) interact(s, p, true, 1 / 60);
    assert.ok(s.bomb);
    const b = s.actors[5];
    b.x = p.x; b.z = p.z; b.kit = true;
    for (let i = 0; i < 241; i++) interact(s, b, true, 1 / 60);
    assert.equal(s.score[1], 1);
    const t = createState();
    t.phase = 'live';
    t.timer = 100;
    t.bomb = { x: 13, z: -10, fuse: 0.001 };
    step(t, { yaw: 0 });
    assert.equal(t.score[0], 1);
  });
});

test('economy: unaffordable and team-locked buys fail, a legal buy charges, and a double endRound pays once', () => {
  const s = createState();
  startRound(s);
  const p = s.actors[0];
  assert.equal(buy(s, p, 2), false);
  assert.equal(buy(s, p, 'kit'), false); // attackers cannot buy the kit
  assert.ok(buy(s, p, 'smoke'));
  assert.equal(p.money, 500);
  s.phase = 'live';
  endRound(s, 0, 'test');
  endRound(s, 0, 'duplicate');
  assert.equal(s.score[0], 1);
  assert.equal(p.money, 1400);
});

test('regression: movement cannot tunnel through cover', () => {
  const a = createState().actors[0];
  a.x = -16; a.z = -5;
  move(a, 10, 0);
  assert.ok(a.x < -13.7);
});

test('regression: dead actors lose equipment and velocity on respawn', () => {
  const s = createState(), p = s.actors[0];
  Object.assign(p, { alive: false, w: 4, armor: 100, helmet: true, kit: true, vx: 5, vz: 3 });
  p.grenades.frag = 2;
  startRound(s);
  assert.equal(p.w, 0);
  assert.equal(p.armor, 0);
  assert.equal(p.kit, false);
  assert.equal(p.vx, 0);
  assert.equal(p.grenades.frag, 0);
});

test('regression: a bot that spots an enemy stops planting instead of finishing the hold', () => {
  const s = createState();
  s.phase = 'live';
  s.timer = 100;
  const a = s.actors[1], b = s.actors[5];
  a.x = -18; a.z = -10; a.progress = 2;
  b.x = -18; b.z = -15;
  for (const c of s.actors) if (c !== a && c !== b) c.alive = false;
  step(s, { yaw: 0 });
  assert.equal(a.progress, 0);
});

test('soak: three seeded twelve-round matches stay finite and terminate', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const s = createState(seed);
    startRound(s);
    for (let i = 0; i < 95000 && s.phase !== 'over'; i++) step(s, { yaw: 0 });
    assert.equal(s.phase, 'over');
    assert.ok(s.round <= 12);
    assert.ok(s.score[0] + s.score[1] <= 12);
    for (const a of s.actors) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
      assert.ok(a.hp >= 0 && a.money >= 0);
    }
  }
});

test('PDF economy: $800 start, 15 s buy phase, 100 s live round', () => {
  const s = createState();
  startRound(s);
  assert.equal(s.actors[0].money, 800);
  assert.equal(s.timer, 15);
  assert.equal(s.actors[0].w, 0);
  for (let i = 0; i < 901; i++) step(s, { yaw: 0 });
  assert.equal(s.phase, 'live');
  assert.ok(s.timer > 99.9);
});

test('paused match freezes timer, movement and objective', () => {
  const s = createState();
  startRound(s);
  s.paused = true;
  const before = structuredClone(s);
  for (let i = 0; i < 120; i++) step(s, { yaw: 0, forward: true });
  assert.deepEqual(s, before);
});

test('shots produce a muzzle pulse and a tracer; a wall stops the damage', () => {
  const s = createState();
  s.phase = 'live';
  const p = s.actors[0], b = s.actors[5];
  p.x = -18; p.z = -5;
  b.x = -8; b.z = -5;
  assert.ok(fire(s, p, -Math.PI / 2));
  assert.equal(b.hp, 100);
  assert.ok(p.muzzle > 0);
  assert.ok(s.effects.length > 0);
  assert.ok(s.effects[0].wallHit);
  assert.ok(s.effects[0].ex < -13);
});

test('jump: a short tap lifts off during buy phase, rises, and lands without hopping again', () => {
  const s = createState();
  startRound(s);
  const p = s.actors[0], input = { yaw: 0, jumpPressed: true, jump: false };
  step(s, input);
  assert.ok(p.y > 0 && p.vy > 0);
  assert.equal(input.jumpPressed, false);
  let max = p.y;
  for (let i = 0; i < 120; i++) {
    playerMotion(p, { yaw: 0, jump: true }, 1 / 60);
    max = Math.max(max, p.y);
  }
  assert.ok(max > 0.8);
  assert.equal(p.y, 0);
  assert.equal(p.vy, 0);
});

test('crouch: stance blends smoothly, lowers the eye, and slows movement', () => {
  const a = createState().actors[0], b = structuredClone(a);
  for (let i = 0; i < 30; i++) {
    playerMotion(a, { yaw: 0, forward: true, crouch: true }, 1 / 60);
    playerMotion(b, { yaw: 0, forward: true }, 1 / 60);
  }
  assert.ok(a.crouchAmount > 0.9);
  assert.ok(Math.abs(a.z + 6) < Math.abs(b.z + 6));
  for (let i = 0; i < 30; i++) playerMotion(a, { yaw: 0, crouch: false }, 1 / 60);
  assert.ok(a.crouchAmount < 0.05);
});
