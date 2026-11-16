// Round flow: elimination, non-lethal hits, player death, planted charges,
// defuse timing, and dead players throwing nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../game/state.js';
import { startRound, step, roundOutcome } from '../game/simulation.js';
import { damage, grenade } from '../game/combat.js';
import { observerActor, nextObserver } from '../game/camera-policy.js';

function live(team = 0) {
  const s = createState();
  for (const a of s.actors) a.team = (a.id < 5 ? 0 : 1) ^ team;
  startRound(s);
  s.phase = 'live';
  s.timer = 100;
  for (const a of s.actors) { a.ammo = 0; a.reserve = 0; }
  return s;
}

test('elimination: first four deaths do not end a 5v5 round; fifth awards exactly one win, either side', () => {
  for (const team of [0, 1]) {
    const s = live(team), p = s.actors[0];
    const enemies = s.actors.filter((a) => a.team !== team);
    for (let i = 0; i < 5; i++) {
      damage(s, enemies[i], 1000, p);
      step(s, { yaw: 0 });
      assert.equal(s.actors.filter((a) => a.alive && a.team !== team).length, 4 - i);
      assert.equal(s.phase, i < 4 ? 'live' : 'end');
      assert.equal(s.score[team], i < 4 ? 0 : 1);
    }
    for (let i = 0; i < 60; i++) step(s, { yaw: 0 });
    assert.equal(s.score[team], 1);
    for (let i = 0; i < 241; i++) step(s, { yaw: 0 });
    assert.equal(s.phase, 'buy');
    assert.equal(s.actors.filter((a) => a.alive).length, 10);
  }
});

test('nonlethal hit: target and surviving teammates continue simulation instead of freezing', () => {
  const s = live(), enemy = s.actors[5], p = s.actors[0];
  damage(s, enemy, 10, p);
  assert.ok(enemy.alive && enemy.hp > 0);
  const before = s.actors.map((a) => [a.x, a.z]);
  for (let i = 0; i < 120; i++) step(s, { yaw: 0 });
  assert.equal(s.phase, 'live');
  assert.equal(s.paused, false);
  assert.ok(s.timer < 99);
  assert.ok(Math.hypot(enemy.x - before[5][0], enemy.z - before[5][1]) > 0.1);
  assert.ok(s.actors.slice(6).some((a) => Math.hypot(a.x - before[a.id][0], a.z - before[a.id][1]) > 0.5));
});

test('player death: allies keep playing, timer runs, spectator switches only between surviving allies', () => {
  const s = live(), p = s.actors[0];
  damage(s, p, 1000, s.actors[5]);
  const before = s.actors.slice(1, 5).map((a) => [a.x, a.z]);
  for (let i = 0; i < 120; i++) step(s, { yaw: 0 });
  assert.equal(s.phase, 'live');
  assert.ok(s.timer < 99);
  assert.equal(s.paused, false);
  assert.ok(s.actors.slice(1, 5).some((a, i) => Math.hypot(a.x - before[i][0], a.z - before[i][1]) > 1));
  const input = {};
  const first = observerActor(s, input);
  nextObserver(s, input);
  assert.notEqual(observerActor(s, input).id, first.id);
  assert.equal(observerActor(s, input).team, p.team);
  damage(s, observerActor(s, input), 1000, s.actors[5]);
  assert.ok(observerActor(s, input).alive);
});

test('planted bomb: attackers all dead still allows defenders to defuse; time expiry alone does not win', () => {
  const s = live();
  s.bomb = { x: 13, z: -10, fuse: 30 };
  s.timer = -1;
  for (const a of s.actors) if (a.team === 0) a.alive = false;
  assert.equal(roundOutcome(s), false);
  s.bomb.fuse = 0;
  assert.equal(roundOutcome(s), true);
  assert.equal(s.score[0], 1);
});

test('bot defuse: round resolution stops later bots and does not award a second win', () => {
  const s = live();
  s.bomb = { x: 13, z: -10, fuse: 20 };
  for (const b of s.actors) if (b.team === 0) b.alive = false;
  const a = s.actors[5];
  Object.assign(a, { x: 13, z: -10, kit: true, progress: 3.999 });
  const before = [s.actors[6].x, s.actors[6].z];
  step(s, { yaw: 0 });
  assert.equal(s.phase, 'end');
  assert.equal(s.result, 'CHARGE DEFUSED');
  assert.deepEqual([s.actors[6].x, s.actors[6].z], before);
  assert.deepEqual(s.score, [0, 1]);
});

test('dead player cannot throw a grenade after being eliminated', () => {
  const s = live(), p = s.actors[0];
  p.grenades.frag = 1;
  p.alive = false;
  assert.equal(grenade(s, p, 'frag', 0), false);
  assert.equal(p.grenades.frag, 1);
  assert.equal(s.effects.length, 0);
});
