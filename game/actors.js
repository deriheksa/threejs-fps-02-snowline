// SNOWLINE — voxel soldiers.
// Each soldier is a small group of boxes (head, torso, limbs, weapon) driven
// by two-bone inverse kinematics so the legs walk, the torso leans and the
// arms aim the gun. Bodies are rebuilt when a soldier dies or respawns.
import * as THREE from 'three';
import { weapons } from './state.js';

const SKIN = [0xf0cfa8, 0xd8b47e, 0xa8825a, 0x7a6248, 0x8a7458];
const CLOTH = [0x5a8ab5, 0x4a7a9e, 0xb06048, 0x6a7a4a, 0x7a6490];

// One box with a standard material, positioned inside a group.
// `glow` (0..1) adds an emissive lift in the box's own colour — used for
// team torsos so soldiers read at a glance in blue hour.
function box(parent, w, h, d, x, y, z, color, roughness = 0.8, glow = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color, roughness, metalness: 0.05,
      emissive: glow ? new THREE.Color(color) : 0x000000,
      emissiveIntensity: glow,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Two-bone IK for one leg: hip at (0, hipH), foot target (x, y, z).
// Returns the joint angles (hip, knee) in radians.
export function solveLimb(length, target) {
  const d = Math.max(0.05, Math.min(2 * length - 0.01, Math.hypot(target.x, target.y, target.z)));
  const base = Math.atan2(target.x, -target.y);
  const spread = Math.acos(Math.max(-1, Math.min(1, d / (2 * length))));
  return { hip: base - spread, knee: 2 * spread };
}

// Aim both arms at the gun: returns shoulder/elbow angles for one arm.
export function aimJoint(shoulder, hand) {
  const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y, dz = hand.z - shoulder.z;
  const d = Math.max(0.05, Math.hypot(dx, dy, dz));
  return {
    yaw: Math.atan2(dx, -dz),
    pitch: Math.asin(Math.max(-1, Math.min(1, dy / d))),
    reach: d,
  };
}

// Build (and cache) the three.js group for one soldier. Called once per
// soldier; view.js only updates positions and poses after that.
const cache = new Map();
export function preloadActors(actors) {
  for (const a of actors) {
    if (cache.has(a.id)) continue;
    const group = new THREE.Group();
    group.userData.artStyle = 'original-articulated-voxel';
    // Bright team colours so soldiers read instantly against the blue hour.
    const teamColor = a.team === 0 ? 0x2fb3ff : 0xff7a45;
    const cloth = CLOTH[a.id % CLOTH.length];
    const skin = SKIN[a.id % SKIN.length];
    const head = box(group, 0.32, 0.3, 0.32, 0, 1.62, 0, skin);
    const torso = box(group, 0.52, 0.72, 0.3, 0, 1.05, 0, teamColor, 0.65, 0.5);
    const shoulders = box(group, 0.56, 0.12, 0.34, 0, 1.32, 0, cloth); // shoulders
    const armL = box(group, 0.14, 0.55, 0.14, -0.34, 1.1, 0, cloth);
    const armR = box(group, 0.14, 0.55, 0.14, 0.34, 1.1, 0, cloth);
    const legL = box(group, 0.17, 0.6, 0.17, -0.13, 0.42, 0, cloth);
    const legR = box(group, 0.17, 0.6, 0.17, 0.13, 0.42, 0, cloth);
    const bootL = box(group, 0.2, 0.12, 0.32, -0.13, 0.06, 0.05, 0x222222); // boots
    const bootR = box(group, 0.2, 0.12, 0.32, 0.13, 0.06, 0.05, 0x222222);
    // Name tag: a canvas sprite floating above the head.
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = a.team === 0 ? '#9fd8ff' : '#ffb0a0';
    ctx.fillText(a.name, 128, 42);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      // depthTest on: tags are occluded by walls, so they never float over
      // solid geometry (and never give away an enemy behind cover).
      map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true,
    }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.set(0, 2.1, 0);
    group.add(sprite);
    // The gun the soldier holds.
    const gun = new THREE.Group();
    const barrel = box(gun, 0.55, 0.08, 0.08, 0, 0, -0.2, 0x1a1d20, 0.5);
    barrel.castShadow = false;
    box(gun, 0.2, 0.1, 0.1, 0, 0, 0.12, 0x1a1d20, 0.5);
    gun.position.set(0.1, 1.28, -0.35);
    group.add(gun);
    cache.set(a.id, { group, head, torso, shoulders, armL, armR, legL, legR, bootL, bootR, gun, sprite });
  }
  return cache;
}

export function actorAssetReady(id) {
  return cache.has(id);
}

// Update one soldier's group from their simulation state: position, facing,
// walk cycle, crouch/prone pose, aim, and death (fallen on their side).
export function animatedSoldier(a, t, dt) {
  const asset = cache.get(a.id);
  if (!asset) return null;
  const { group, head, torso, shoulders, armL, armR, legL, legR, bootL, bootR, gun, sprite } = asset;
  group.position.set(a.x, a.y, a.z);
  group.rotation.y = a.yaw || 0;
  group.visible = a.alive || (a.deathTime ?? 0) > 0;
  sprite.visible = a.alive;
  if (!a.alive) {
    group.rotation.z = Math.PI / 2;
    group.position.y = Math.max(0, a.y + 0.25);
    return group;
  }
  group.rotation.z = 0;
  const speed = Math.hypot(a.vx || 0, a.vz || 0);
  const cycle = t * (speed > 0.5 ? 6 : 0);
  const swing = Math.min(0.6, speed * 0.12);
  const crouch = a.crouchAmount || 0;
  const prone = a.proneAmount || 0;
  legL.rotation.x = Math.sin(cycle) * swing + prone * 1.5;
  legR.rotation.x = -Math.sin(cycle) * swing + prone * 1.5;
  legL.position.y = 0.42 - prone * 0.18;
  legR.position.y = 0.42 - prone * 0.18;
  legL.position.z = prone * 0.45;
  legR.position.z = prone * 0.45;
  bootL.position.z = 0.05 + prone * 0.7;
  bootR.position.z = 0.05 + prone * 0.7;
  armL.rotation.x = -Math.sin(cycle) * swing * 0.6 + prone * 1.2;
  armR.rotation.x = Math.sin(cycle) * swing * 0.6 + prone * 1.2;
  torso.position.y = 1.05 - crouch * 0.22 - prone * 0.55;
  torso.position.z = prone * 0.1;
  head.position.y = 1.62 - crouch * 0.3 - prone * 0.95;
  head.position.z = -prone * 0.35;
  shoulders.position.y = 1.32 - crouch * 0.22 - prone * 0.85;
  shoulders.position.z = -prone * 0.1;
  shoulders.rotation.x = prone * 1.35;
  torso.rotation.x = crouch * 0.35 + prone * 1.35;
  head.rotation.x = -(a.pitch || 0) * 0.5;
  // Aim: both arms point the gun forward; the gun follows the pitch.
  gun.rotation.x = -(a.pitch || 0);
  armL.position.y = 1.1 - crouch * 0.2 - prone * 0.6;
  armR.position.y = 1.1 - crouch * 0.2 - prone * 0.6;
  armL.position.z = -prone * 0.2;
  armR.position.z = -prone * 0.2;
  gun.position.y = 1.28 - crouch * 0.25 - prone * 0.6;
  gun.position.z = -0.35 - prone * 0.3;
  return group;
}
