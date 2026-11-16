// Routes: every spawn slot keeps a walkable route to both objective sites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cover, sites } from '../game/state.js';

test('denser original yard: all ten spawn slots retain walkable routes to both objective sites', () => {
  const clear = (x, z) => Math.abs(x) < 21 && Math.abs(z) < 17
    && !cover.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.55 && Math.abs(z - p.z) < p.d / 2 + 0.55);
  for (const x of [-18, 18]) {
    for (const z of [-6, -3, 0, 3, 6]) {
      assert.ok(clear(x, z));
      const queue = [[x, z]], seen = new Set([x + ',' + z]);
      for (let i = 0; i < queue.length; i++) {
        const [cx, cz] = queue[i];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz, key = nx + ',' + nz;
          if (clear(nx, nz) && !seen.has(key)) { seen.add(key); queue.push([nx, nz]); }
        }
      }
      for (const site of sites) {
        assert.ok(queue.some(([cx, cz]) => Math.hypot(cx - site.x, cz - site.z) < 1.5),
          `${x},${z} cannot reach ${site.name}`);
      }
    }
  }
});
