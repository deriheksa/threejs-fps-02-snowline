// Voxel soldiers and the arena: original articulated cuboids, finite
// geometry everywhere, human proportions, and a mesh budget the renderer
// can afford.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.js';
import { createState } from '../game/state.js';

const T = await import('../game/vendor/three/three.module.min.js');
const actors = await loadModule('actors.js');
const models = await loadModule('models.js');

// Name tags need a canvas; stub the DOM before any actor test runs.
const stubCtx = {
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  strokeRect() {}, fillRect() {}, fillText() {}, ellipse() {}, fill() {},
};
globalThis.document = {
  createElement: () => ({ width: 256, height: 256, getContext: () => stubCtx }),
};

function verify(root, minVertices = 100) {
  let vertices = 0, meshes = 0;
  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isMesh) return;
    meshes++;
    const p = m.geometry.getAttribute('position');
    assert.ok(p && p.count > 0);
    for (const n of p.array) assert.ok(Number.isFinite(n));
    for (const n of m.matrixWorld.elements) assert.ok(Number.isFinite(n));
    vertices += p.count;
  });
  assert.ok(vertices > minVertices);
  return meshes;
}

// Box3 over meshes only (the floating name tag is not part of the body).
// Refresh the world matrices first: pose changes do not update them until
// a render or an explicit updateMatrixWorld.
function bodyBox(group) {
  group.updateMatrixWorld(true);
  const box = new T.Box3();
  group.traverse((m) => {
    if (m.isMesh) box.expandByObject(m);
  });
  return box;
}

function soldier(team = 0) {
  const s = createState();
  const a = s.actors[team === 0 ? 1 : 6];
  actors.preloadActors(s.actors);
  const group = actors.animatedSoldier(a, 0, 1 / 60);
  return { s, a, group };
}

test('voxel art: original articulated cuboid characters, no skinned or downloaded models', () => {
  for (const team of [0, 1]) {
    const { group } = soldier(team);
    assert.equal(group.userData.artStyle, 'original-articulated-voxel');
    let skinned = 0;
    group.traverse((o) => { skinned += o.isSkinnedMesh ? 1 : 0; });
    assert.equal(skinned, 0);
    assert.ok(verify(group) >= 10);
  }
});

test('voxel gait: leg articulation changes with motion and no full-body scaling', () => {
  const { a, group } = soldier(0);
  a.vx = 4.5; a.vz = 0;
  actors.animatedSoldier(a, 0, 1 / 60);
  const leg = group.children.find((c) => c.position.x < 0 && c.position.y < 0.7);
  const before = leg.rotation.x;
  for (let i = 1; i <= 45; i++) actors.animatedSoldier(a, i / 60, 1 / 60);
  assert.ok(Math.abs(leg.rotation.x - before) > 0.01);
  assert.equal(group.scale.y, 1);
  verify(group);
});

test('voxel proportions: standing stays human-sized; crouch lowers head and keeps soles grounded', () => {
  const { a, group } = soldier(0);
  a.crouchAmount = 0;
  for (let i = 0; i < 60; i++) actors.animatedSoldier(a, i / 60, 1 / 60);
  const standing = bodyBox(group);
  assert.ok(standing.max.y > 1.65 && standing.max.y < 2);
  a.crouchAmount = 1;
  for (let i = 0; i < 60; i++) actors.animatedSoldier(a, i / 60, 1 / 60);
  const low = bodyBox(group);
  assert.ok(low.max.y < standing.max.y - 0.25);
  assert.ok(low.min.y > -0.1 && low.min.y < 0.08);
  assert.equal(group.scale.y, 1);
});

test('voxel prone: head lowers and torso stretches horizontally without shrinking the body', () => {
  const { a, group } = soldier(1);
  a.proneAmount = 1;
  for (let i = 0; i < 60; i++) actors.animatedSoldier(a, i / 60, 1 / 60);
  const box = bodyBox(group);
  assert.ok(box.max.y < 0.95);
  assert.ok(box.max.z - box.min.z > 1.25);
  assert.ok(box.min.y > -0.15);
  assert.equal(group.scale.y, 1);
  verify(group);
  a.proneAmount = 0;
  for (let i = 0; i < 60; i++) actors.animatedSoldier(a, i / 60, 1 / 60);
  assert.ok(bodyBox(group).max.y > 1.65);
});

test('weapons: five distinct finite original silhouettes', () => {
  const counts = [];
  for (let i = 0; i < 5; i++) {
    const m = models.weaponModel(i);
    verify(m, 60);
    let n = 0;
    m.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; });
    counts.push(n);
  }
  assert.ok(new Set(counts).size >= 4);
});

test('arena: blue-hour station geometry and original props construct within mesh budget', async () => {
  const { world } = await loadModule('world.js');
  const built = world();
  const lights = [];
  built.scene.traverse((o) => { if (o.isDirectionalLight) lights.push(o); });
  assert.ok(lights.some((l) => l.castShadow));
  let snowPoints = 0;
  built.scene.traverse((o) => {
    if (o.isPoints) snowPoints = o.geometry.attributes.position.count;
  });
  assert.ok(snowPoints > 100);
  assert.ok(verify(built.scene) < 220);
});

test('mobile actor budget: colored voxel limbs stay under forty meshes with a real palette', () => {
  const { group } = soldier(0);
  let meshes = 0;
  const colors = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    colors.add(o.material.color.getHexString());
  });
  assert.ok(meshes < 40);
  assert.ok(colors.size >= 4);
});
