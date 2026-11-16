// Brief compliance: the exact match defaults, the package limits, and the
// bot behaviour the brief requires (investigate a gunshot you hear).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createState, sites, cover, weapons } from '../game/state.js';
import { startRound, step } from '../game/simulation.js';

test('PDF defaults: ten actors, 5v5, two sites, exact prices and 15-second buy', () => {
  const s = createState();
  assert.equal(s.actors.length, 10);
  assert.equal(s.actors.filter((a) => a.team === 0).length, 5);
  assert.equal(sites.length, 2);
  assert.deepEqual(weapons.map((w) => w.price), [200, 1200, 2700, 1100, 4500]);
  startRound(s);
  assert.equal(s.timer, 15);
  assert.equal(s.actors[0].money, 800);
  for (const a of s.actors) {
    assert.ok(!cover.some((c) => Math.abs(a.x - c.x) < c.w / 2 + 0.3 && Math.abs(a.z - c.z) < c.d / 2 + 0.3),
      `spawn ${a.id} in cover`);
  }
});

test('PDF package: required modules, local 187 engine, no downloaded avatar, size budgets', async () => {
  const root = new URL('../game/', import.meta.url);
  for (const name of ['index.html', 'main.js', 'state.js', 'simulation.js', 'world.js',
    'bots.js', 'combat.js', 'view.js', 'audio.js', 'controls.js']) {
    assert.ok((await stat(new URL(name, root))).size > 0);
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.ok(html.includes('importmap'));
  assert.ok((await stat(new URL('index.html', root))).size < 1024 * 1024);
  let bytes = 0, count = 0, authored = 0;
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      count++;
      const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) await walk(u);
      else {
        const n = (await stat(u)).size;
        bytes += n;
        if (!u.pathname.includes('/vendor/') && /\.(js|css|html)$/.test(e.name)) authored += n;
        assert.ok(!/\.(glb|fbx|gltf)$/i.test(e.name));
      }
    }
  }
  await walk(root);
  assert.ok(bytes < 48 * 1024 * 1024);
  assert.ok(count < 993);
  assert.ok(authored < 160 * 1024);
  const engine = await readFile(new URL('vendor/three/three.core.min.js', root), 'utf8');
  assert.ok(engine.includes("REVISION = '187'"));
});

test('PDF bots: investigate a recent unseen hostile gunshot instead of ignoring it', () => {
  const s = createState();
  s.phase = 'live';
  s.timer = 100;
  const a = s.actors[1];
  a.x = -18; a.z = -1;
  s.gunfire = [{ x: -12, z: -7, t: 0, team: 1, actor: 5 }];
  for (const b of s.actors) if (b.team === 1) { b.x = 18; b.z = 16; }
  step(s, { yaw: 0 });
  assert.ok(a.lastKnown);
  assert.equal(a.lastKnown.x, -12);
});
