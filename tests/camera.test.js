// Spectator camera: first-person hides your own body, the spectator hides
// only the ally being watched, and the dead never show up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actorVisible } from '../game/camera-policy.js';

test('FPP regression: an unset initial mode must explicitly hide the local body before any camera toggle', () => {
  const p = { id: 0, alive: true };
  for (const mode of [undefined, null, false, 0]) {
    assert.strictEqual(actorVisible(p, p, mode, p), false);
  }
  assert.strictEqual(actorVisible(p, p, true, p), true);
  assert.strictEqual(actorVisible(p, p, false, p), false);
});

test('camera visibility: ten actors keep strict booleans, spectator hides only the observed actor', () => {
  const actors = Array.from({ length: 10 }, (_, id) => ({ id, alive: true }));
  const p = actors[0];
  assert.equal(actors.filter((a) => actorVisible(a, p, undefined, p)).length, 9);
  p.alive = false;
  assert.strictEqual(actorVisible(actors[1], p, false, actors[1]), false);
  assert.strictEqual(actorVisible(actors[2], p, false, actors[1]), true);
  assert.strictEqual(actorVisible(p, p, true, actors[1]), false);
});
