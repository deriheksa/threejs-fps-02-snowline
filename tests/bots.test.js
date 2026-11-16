// Bot squads: team composition, movement, reloads, cover-seeking, and the
// prone firing pose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../game/state.js';
import { startRound, step, move, interact } from '../game/simulation.js';
import { bots } from '../game/bots.js';
import { eyeHeight, bodyTop, actorRay } from '../game/stance.js';

test('5v5: ten distinct actors respawn as player + four allies against five enemies', () => {
  for (const team of [0, 1]) {
    const s = createState();
    for (const a of s.actors) a.team = (a.id < 5 ? 0 : 1) ^ team;
    startRound(s);
    assert.equal(s.actors.filter((a) => a.alive && a.team === team).length, 5);
    assert.equal(s.actors.filter((a) => a.alive && a.team !== team).length, 5);
    assert.equal(new Set(s.actors.map((a) => a.x + ',' + a.z)).size, 10);
    s.actors[7].alive = false;
    s.actors[7].prone = true;
    s.actors[7].lastKnown = { x: 0, z: 0 };
    startRound(s);
    assert.ok(s.actors.every((a) => a.alive && !a.prone && !a.lastKnown));
  }
});

test('bots: all nine bots leave spawn during a live round, including defenders', () => {
  const s = createState();
  startRound(s);
  s.phase = 'live';
  s.timer = 100;
  const before = s.actors.map((a) => ({ x: a.x, z: a.z }));
  for (const a of s.actors) { a.ammo = 0; a.reserve = 0; }
  for (let i = 0; i < 300; i++) step(s, { yaw: 0 });
  for (const a of s.actors.slice(1)) {
    assert.ok(Math.hypot(a.x - before[a.id].x, a.z - before[a.id].z) > 1, `${a.name} stayed at spawn`);
  }
});

test('bots: an empty magazine reloads and resumes firing, and the bot keeps moving', () => {
  const s = createState();
  s.phase = 'live';
  s.timer = 100;
  for (const a of s.actors) a.alive = false;
  const target = s.actors[0], a = s.actors[5];
  Object.assign(target, { alive: true, x: -18, z: 8, hp: 10000 });
  Object.assign(a, { alive: true, x: -18, z: -5, ammo: 0, reserve: 90 });
  let reloading = false, fired = false, prone = false, moved = false;
  for (let i = 0; i < 600; i++) {
    step(s, { yaw: 0 });
    reloading ||= a.reload > 0;
    fired ||= a.lastShot > 0;
    prone ||= a.prone;
    moved ||= Math.abs(a.x + 18) > 0.5 || Math.abs(a.z + 5) > 0.5;
  }
  assert.ok(reloading);
  assert.ok(fired);
  assert.ok(moved);
});

test('bots: taking damage selects reachable shelter instead of firing in place forever', () => {
  const s = createState();
  s.phase = 'live';
  for (const a of s.actors) a.alive = false;
  Object.assign(s.actors[0], { alive: true, x: -18, z: -7 });
  const a = s.actors[5];
  Object.assign(a, { alive: true, x: -18, z: 0, hurt: 0.3 });
  bots(s, 1 / 60, move, (x, h, t) => interact(s, x, h, t));
  assert.ok(a.coverGoal);
  assert.equal(a.behavior, 'TAKING COVER');
});

test('prone: eye, body height and horizontal hit footprint change together', () => {
  const a = { x: 0, z: 0, y: 0, yaw: 0, prone: true, crouch: false };
  assert.ok(eyeHeight(a) < 0.5);
  assert.ok(bodyTop(a) < 0.8);
  assert.notEqual(actorRay(a, -2, 0.8, 1, 0), null);
  assert.equal(actorRay({ ...a, prone: false }, -2, 0.8, 1, 0), null);
});

test('bots: a long-range engagement enters and leaves a short prone firing phase', () => {
  const s = createState();
  s.phase = 'live';
  s.t = 1.6;
  for (const a of s.actors) a.alive = false;
  Object.assign(s.actors[0], { alive: true, x: -17, z: 16 });
  const a = s.actors[5];
  Object.assign(a, { alive: true, x: -17, z: -1 });
  bots(s, 1 / 60, move, () => {});
  assert.ok(a.prone);
  assert.equal(a.behavior, 'PRONE / FIRE');
  s.t = 4;
  bots(s, 1 / 60, move, () => {});
  assert.equal(a.prone, false);
});

test('bots: a bot must watch an enemy for ~0.35 s before its first shot (rounds do not end in seconds)', () => {
  const s = createState();
  s.phase = 'live';
  s.timer = 100;
  for (const a of s.actors) a.alive = false;
  Object.assign(s.actors[0], { alive: true, x: -18, z: 8, hp: 10000 });
  const a = s.actors[5];
  Object.assign(a, { alive: true, x: -18, z: -5, ammo: 30, reserve: 90 });
  for (let i = 0; i < 18; i++) step(s, { yaw: 0 }); // 0.3 s — still inside the reaction delay
  assert.equal(a.lastShot || 0, 0);
  for (let i = 0; i < 120; i++) step(s, { yaw: 0 });
  assert.ok(a.lastShot > 0);
});
