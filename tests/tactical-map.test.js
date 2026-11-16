// Tactical map: five-metre lanes, tall separators, a broken Mid sightline,
// cover at most 8 m apart, two narrow entries per walled site, and a radar
// that keeps the player's forward vector at the top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cover, laneWidth } from '../game/terrain.js';
import { findRoute } from '../game/navigation.js';
import { blocked } from '../game/combat.js';
import { createState } from '../game/state.js';
import { radarPoint, radarContacts } from '../game/radar.js';

test('tactical lanes: five-metre lanes, tall separators, broken Mid sightline and <=8m cover spacing', () => {
  assert.equal(laneWidth, 5);
  assert.ok(cover.filter((p) => p.kind === 'tacticalwall').every((p) => p.h >= 3.6));
  assert.ok(blocked(-14, 0, 8, 0));
  for (const z of [-12, 12]) {
    const xs = [-14, ...cover
      .filter((p) => p.kind === 'cargo' && Math.abs(p.z - z) < 2 && p.x > -14 && p.x < 9)
      .map((p) => p.x).sort((a, b) => a - b), 9];
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] <= 8);
  }
});

test('both walled sites retain two narrow accessible entrances and no east-wall entrance', () => {
  for (const z of [-12, 12]) {
    assert.ok(findRoute({ x: 8, z }, { x: 13, z: z < 0 ? -10 : 11 }).length > 0);
    assert.ok(findRoute({ x: 13, z: z < 0 ? -7 : 7 }, { x: 13, z: z < 0 ? -10 : 11 }).length > 0);
    assert.ok(blocked(18, z, 15.8, z));
  }
});

test('heading-up radar: player forward vector remains at the top after rotation', () => {
  for (const yaw of [0, 0.5, Math.PI / 2, Math.PI, -2]) {
    const p = radarPoint(-Math.sin(yaw) * 10, -Math.cos(yaw) * 10, { x: 0, z: 0 }, yaw, 2, 100, 100);
    assert.ok(Math.abs(p.x - 100) < 1e-8);
    assert.ok(Math.abs(p.y - 80) < 1e-8);
  }
});

test('enemy radar: wall-hidden enemies are not tracked, last-seen uses old coordinates and expires', () => {
  const s = createState();
  for (const a of s.actors) a.alive = false;
  const p = s.actors[0], e = s.actors[5];
  Object.assign(p, { alive: true, x: -18, z: -5 });
  Object.assign(e, { alive: true, x: -18, z: 0 });
  const m = new Map();
  assert.equal(radarContacts(s, p.team, m).filter((a) => !a.friend).length, 1);
  e.x = 13; e.z = -10;
  s.t = 1;
  const seen = radarContacts(s, p.team, m).find((a) => !a.friend);
  assert.ok(seen && !seen.visible);
  assert.equal(seen.x, -18);
  s.t = 4;
  assert.equal(radarContacts(s, p.team, m).filter((a) => !a.friend).length, 0);
});
