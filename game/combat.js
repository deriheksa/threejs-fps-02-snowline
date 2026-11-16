// SNOWLINE — line of sight, damage, shooting, reloads, grenades.
// Hit detection is a ray against each soldier's body: a horizontal ray
// against the standing circle (or prone capsule) plus a pitch-aware height
// window, with a head zone at the top of the body for double damage.
// Walls are tested with a slab test per axis so low cover only blocks
// low rays.
import { eyeHeight, bodyTop, proneAmount, actorRay } from './stance.js';
import { weapons, random, log, walls, cover } from './state.js';

// Fraction of the segment (x,z)->(xx,zz) reached before a wall is hit
// (1 = clear). y/yy are the ray heights at the two ends; a wall only
// blocks when the ray is below its top at the crossing point.
export function wallFraction(x, z, xx, zz, y = 1.4, yy = y) {
  const dx = xx - x, dz = zz - z;
  let nearest = 1;
  for (let i = 0; i < walls.length; i++) {
    const [cx, cz, w, d] = walls[i];
    let lo = 0, hi = 1;
    for (const [p, v, mn, mx] of [
      [x, dx, cx - w / 2, cx + w / 2],
      [z, dz, cz - d / 2, cz + d / 2],
    ]) {
      if (Math.abs(v) < 1e-8) {
        if (p < mn || p > mx) { lo = 2; break; }
      } else {
        const a = (mn - p) / v, b = (mx - p) / v;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
    }
    if (lo <= hi && hi > 0 && lo < nearest) {
      const entry = Math.max(0, lo), exit = Math.min(1, hi);
      const dy = yy - y;
      let hit = entry;
      if (y + dy * entry > cover[i].h) {
        if (dy >= 0) continue;
        hit = (cover[i].h - y) / dy;
      }
      if (y + dy * hit < 0 || hit > exit) continue;
      nearest = Math.max(0, hit);
    }
  }
  return nearest;
}

// True when a wall stands between the two points.
export function blocked(x, z, xx, zz, y = 1.4, yy = y) {
  return wallFraction(x, z, xx, zz, y, yy) < 0.99999;
}

// Apply damage to a soldier. Armour absorbs 45% of a hit (0% on a bare
// headshot). A kill pays the attacker $300 and writes to the feed.
export function damage(s, target, amount, attacker, head = false) {
  if (!target.alive || amount <= 0) return;
  const absorb = Math.min(target.armor, amount * (head && !target.helmet ? 0 : 0.45));
  target.armor -= absorb;
  target.hp = Math.max(0, target.hp - amount + absorb);
  target.hurt = 0.3;
  if (!target.hp) {
    target.alive = false;
    target.progress = 0;
    target.vx = target.vz = target.vy = 0;
    target.behavior = 'DOWN';
    target.deaths++;
    attacker.kills++;
    attacker.money = Math.min(16000, attacker.money + 300);
    s.feed.unshift(`${attacker.name} [${weapons[attacker.w].name}] ${target.name}${head ? ' · HS' : ''}`);
    s.feed.length = Math.min(5, s.feed.length);
    log(s, `${attacker.name}: Contact neutralized.`);
  }
}

// Fire one trigger pull (all pellets for shotguns). yaw/pitch aim the shot;
// moving and aim adjust spread. Returns false when the weapon cannot fire.
export function fire(s, a, yaw, pitch = 0, moving = false, aim = false) {
  if (!a.alive || a.cool > 0 || a.reload > 0 || s.phase !== 'live' || !a.ammo) return false;
  const w = weapons[a.w];
  a.ammo--;
  a.cool = 60 / w.rpm;
  a.muzzle = 0.085;
  s.shotSerial = (s.shotSerial || 0) + 1;
  a.lastShot = s.shotSerial;
  s.gunfire ??= [];
  s.gunfire.push({ x: a.x, z: a.z, t: s.t, team: a.team, actor: a.id });
  if (s.gunfire.length > 16) s.gunfire.shift();

  const eye = eyeHeight(a);
  for (let n = 0; n < (w.pellets || 1); n++) {
    // Bots are less precise than the player (0.028 vs 0.006 base spread),
    // so duels last long enough to use cover instead of ending instantly.
    let spread = (a.id === 0 ? 0.006 : 0.028) + (moving ? 0.018 : 0) + (a.grounded === false ? 0.035 : 0);
    if (aim) spread *= 0.4;
    const angle = yaw + (random(s) - 0.5) * spread * 2;
    const vertical = pitch + (random(s) - 0.5) * spread;
    const dx = -Math.sin(angle), dz = -Math.cos(angle);
    const wallHit = wallFraction(a.x, a.z, a.x + dx * 80, a.z + dz * 80, eye, eye - Math.tan(vertical) * 80) * 80;
    let best = null, dist = wallHit;
    for (const b of s.actors) {
      if (!b.alive || b.team === a.team) continue;
      const t = actorRay(b, a.x, a.z, dx, dz);
      const height = eye - Math.tan(vertical) * (t || 0);
      if (t !== null && t > 0 && t < dist && height > b.y + 0.05 && height < bodyTop(b)) {
        best = b; dist = t;
      }
    }
    const end = {
      x: a.x + dx * dist, z: a.z + dz * dist,
      y: eye - Math.tan(vertical) * dist,
    };
    s.effects.push({
      x: a.x, z: a.z, y: eye, ex: end.x, ez: end.z, ey: end.y,
      life: 0.12, team: a.team, shooter: a.id, wallHit: !best && wallHit < 80,
    });
    if (!best && wallHit < 80) {
      s.effects.push({ x: end.x, y: end.y, z: end.z, life: 0.5, impact: true });
    }
    if (best) {
      const crouchDrop = (best.crouchAmount ?? (best.crouch ? 1 : 0)) * 0.4;
      const head = proneAmount(best) < 0.5 && end.y > best.y + 1.48 - crouchDrop;
      damage(s, best, w.dmg * (head ? 2 : 1) * Math.max(0.4, 1 - (dist / w.range) * 0.25), a, head);
      if (a.id === 0) { s.hit = 0.2; s.headHit = head; }
    }
  }
  return true;
}

// Start a 2.1 s reload when the magazine is not full and reserve remains.
export function reload(a) {
  if (a.alive && !a.reload && a.ammo < weapons[a.w].mag && a.reserve > 0) {
    a.reload = 2.1;
    return true;
  }
  return false;
}

// Throw a grenade 12 m forward (stopped by walls). Frag damages, flash
// blinds the player when close and in line of sight, smoke lays a 15 s cloud.
export function grenade(s, a, type, yaw) {
  if (s.phase !== 'live' || !a.alive || !a.grenades[type]) return false;
  a.grenades[type]--;
  let x = a.x, z = a.z;
  for (let i = 0; i < 60; i++) {
    const nx = x - Math.sin(yaw) * 0.2, nz = z - Math.cos(yaw) * 0.2;
    if (blocked(x, z, nx, nz, 0.5)) break;
    x = nx; z = nz;
  }
  if (type === 'smoke') s.smokes.push({ x, z, life: 15 });
  if (type === 'frag') {
    for (const b of s.actors) {
      if (b.alive && b.team !== a.team && !blocked(x, z, b.x, b.z)) {
        damage(s, b, Math.max(0, 100 - Math.hypot(b.x - x, b.z - z) * 20), a);
      }
    }
    s.effects.push({ x, z, y: 1, ex: x, ez: z, ey: 2, life: 0.65, blast: true, team: a.team });
  }
  if (type === 'flash') {
    s.effects.push({ x, z, y: 1, ex: x, ez: z, ey: 2, life: 0.3, flash: true, team: a.team });
    if (Math.hypot(s.actors[0].x - x, s.actors[0].z - z) < 17
      && !blocked(x, z, s.actors[0].x, s.actors[0].z)) s.flash = 2;
  }
  log(s, `${a.name}: ${type.toUpperCase()} deployed.`);
  return true;
}
