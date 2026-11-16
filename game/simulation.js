// SNOWLINE — the match loop: movement, rounds, plant/defuse, timing.
// Fixed 60 Hz step; every number here is a design constant from the brief:
// 15 s buy, 100 s live round, 3 s plant, 35 s fuse, 5 s defuse (4 s with kit),
// first to 7, max 12 rounds, 6-6 draws.
import { sites, walls, cover, surfaceAt, weapons, log } from './state.js';
import { bots, botBuy } from './bots.js';

// Move a soldier by (dx, dz), sliding along walls in small sub-steps so
// fast movement never tunnels through a prop. y is the soldier's height:
// low cover blocks only while the soldier is below its top.
export function move(a, dx, dz) {
  const valid = (x, z) =>
    Math.abs(x) < 21.2 && Math.abs(z) < 17.2
    && !cover.some((p) => a.y < p.h - 0.03
      && Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.3);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.15));
  for (let i = 0; i < n; i++) {
    if (valid(a.x + dx / n, a.z)) a.x += dx / n;
    if (valid(a.x, a.z + dz / n)) a.z += dz / n;
  }
}

// Start the next round: respawn everyone at their spawn line, reset per-round
// state, let bots buy, and open the 15 s buy phase. Ends the match at 7 wins
// or 12 rounds.
export function startRound(s) {
  if (s.score.some((n) => n >= 7) || s.round >= 12) { s.phase = 'over'; return; }
  s.round++;
  s.phase = 'buy';
  s.timer = 15;
  s.bomb = null;
  s.plant = 0;
  s.smokes = [];
  s.effects = [];
  s.gunfire = [];
  for (const a of s.actors) {
    a.x = a.team === 0 ? -18 : 18;
    a.z = (a.id % 5 - 2) * 3;
    if (!a.alive) {
      a.w = 0; a.armor = 0; a.helmet = false; a.kit = false;
      a.grenades = { frag: 0, flash: 0, smoke: 0 };
    }
    a.grounded = true; a.coyote = 0.08; a.pitch = 0;
    a.sprint = false; a.aim = false;
    a.jumpLatch = false; a.jumpBuffer = 0; a.land = 0;
    a.crouchAmount = 0; a.vx = 0; a.vz = 0; a.muzzle = 0; a.hurt = 0;
    a.crouch = false; a.prone = false; a.proneAmount = 0;
    a.lastKnown = null; a.coverGoal = null; a.coverUntil = 0;
    a.behavior = 'READY'; a.react = 0;
    a.nextPathAt = 0; a.routeTime = 0; a.route = null; a.progress = 0;
    a.hp = 100; a.alive = true; a.y = 0; a.vy = 0;
    a.reload = 0; a.cool = 0;
    a.ammo = weapons[a.w].mag;
    a.reserve = a.ammo * 4;
  }
  botBuy(s);
  log(s, `ROUND ${s.round} / ${s.actors[0].team === 0 ? 'SUMMIT attacks' : 'VALE defends'}`);
}

// Close a live round: award the score and the round money, then a 5 s pause.
export function endRound(s, team, reason) {
  if (s.phase !== 'live') return;
  s.score[team]++;
  s.phase = 'end';
  s.timer = 5;
  s.result = reason;
  for (const a of s.actors) {
    a.money = Math.min(16000, a.money + (a.team === team ? 900 : 600));
  }
  log(s, `${team === 0 ? 'SUMMIT' : 'VALE'} wins · ${reason}`);
}

// Check whether the live round has an outcome yet. A planted charge keeps
// the round alive until it detonates or is defused, even with no attackers left.
export function roundOutcome(s) {
  if (s.phase !== 'live') return false;
  const alive = [0, 0];
  for (const a of s.actors) if (a.alive) alive[a.team]++;
  if (s.bomb && s.bomb.fuse <= 0) endRound(s, 0, 'CHARGE DETONATED');
  else if (!alive[1]) endRound(s, 0, 'VALE ELIMINATED');
  else if (!s.bomb && !alive[0]) endRound(s, 1, 'SUMMIT ELIMINATED');
  else if (!s.bomb && s.timer <= 0) endRound(s, 1, 'TIME EXPIRED');
  return s.phase !== 'live';
}

// Hold USE to plant (attackers, near a site, no charge yet) or defuse
// (defenders, near the charge). Progress resets the moment the hold breaks.
export function interact(s, a, held, dt) {
  if (s.phase !== 'live' || !a.alive) { a.progress = 0; return; }
  const nearSite = sites.some((p) => Math.hypot(p.x - a.x, p.z - a.z) < 3);
  if (a.team === 0 && !s.bomb && nearSite && held) {
    a.progress += dt;
    if (a.progress >= 3) {
      s.bomb = { x: a.x, z: a.z, fuse: 35 };
      a.money = Math.min(16000, a.money + 300);
      a.progress = 0;
      log(s, `${a.name}: Charge planted. Hold the site!`);
    }
  } else if (a.team === 1 && s.bomb && Math.hypot(s.bomb.x - a.x, s.bomb.z - a.z) < 3 && held) {
    a.progress += dt;
    if (a.progress >= (a.kit ? 4 : 5)) endRound(s, 1, 'CHARGE DEFUSED');
  } else {
    a.progress = 0;
  }
}

// Move with body separation: never walk through a living soldier. Each axis
// is cancelled independently so bodies slide past each other.
export function moveAmong(s, a, dx, dz) {
  const dist = (x, z, b) => Math.hypot(x - b.x, z - b.z);
  let x = dx, z = dz;
  for (const b of s.actors) {
    if (b === a || !b.alive || Math.abs((b.y || 0) - (a.y || 0)) > 1.5) continue;
    const current = dist(a.x, a.z, b);
    if (dist(a.x + x, a.z + z, b) < 0.68 && dist(a.x + x, a.z + z, b) < current) {
      if (dist(a.x + x, a.z, b) < current) x = 0;
      if (dist(a.x, a.z + z, b) < current) z = 0;
    }
  }
  move(a, x, z);
}

// Player locomotion: crouch blend, jump with buffer + coyote time, gravity,
// and velocity easing (fast on the ground, soft in the air).
export function playerMotion(p, input, dt, movement = move) {
  p.crouch = !!input.crouch;
  p.crouchAmount = (p.crouchAmount || 0)
    + ((p.crouch ? 1 : 0) - (p.crouchAmount || 0)) * Math.min(1, dt * 13);
  p.yaw = input.yaw || 0;
  p.pitch = input.pitch || 0;
  p.sprint = !!input.sprint && !input.aim && !p.crouch;
  p.aim = !!input.aim;
  p.land = Math.max(0, (p.land || 0) - dt * 3);

  if (input.jumpPressed || (input.jump && !p.jumpLatch)) p.jumpBuffer = 0.15;
  p.jumpLatch = !!input.jump;
  input.jumpPressed = false;
  p.jumpBuffer = Math.max(0, (p.jumpBuffer || 0) - dt);

  const floor = surfaceAt(p.x, p.z);
  const grounded = p.y <= floor + 0.025 && p.vy <= 0;
  p.coyote = grounded ? 0.08 : Math.max(0, (p.coyote || 0) - dt);
  if (p.jumpBuffer > 0 && (grounded || p.coyote > 0)) {
    p.vy = 6.1; p.jumpBuffer = 0; p.coyote = 0;
    p.jumpCount = (p.jumpCount || 0) + 1;
  }

  const speed = p.crouch ? 1.8 : p.aim ? 2.5 : p.sprint ? 5.8 : 3.7;
  const tx = (input.right || 0) - (input.left || 0) + (input.moveX || 0);
  const tz = (input.back || 0) - (input.forward || 0) + (input.moveZ || 0);
  const len = Math.max(1, Math.hypot(tx, tz));
  const yaw = input.yaw || 0;
  const x = ((tx * Math.cos(yaw) + tz * Math.sin(yaw)) / len) * speed;
  const z = ((-tx * Math.sin(yaw) + tz * Math.cos(yaw)) / len) * speed;
  const airRate = Math.abs(tx) + Math.abs(tz) > 0.01 ? 3.2 : 0.18;
  p.vx = (p.vx || 0) + (x - (p.vx || 0)) * Math.min(1, dt * (grounded ? 11 : airRate));
  p.vz = (p.vz || 0) + (z - (p.vz || 0)) * Math.min(1, dt * (grounded ? 11 : airRate));
  movement(p, p.vx * dt, p.vz * dt);

  const before = p.y;
  const surface = surfaceAt(p.x, p.z);
  p.vy -= 18 * dt;
  p.y += p.vy * dt;
  if (p.y <= surface && before >= surface - 0.04) {
    if (p.vy < -2) p.land = 0.3;
    p.y = surface;
    p.vy = 0;
  }
  if (p.y < 0) { p.y = 0; p.vy = 0; }
  p.grounded = p.y <= surface + 0.025 && p.vy <= 0;
}

// One fixed 60 Hz tick: timers, cooldowns, reloads, effect lifetimes, the
// buy-to-live transition, the player, the bots, the bomb fuse, outcomes.
export function step(s, input, dt = 1 / 60) {
  if (s.paused || !['buy', 'live', 'end'].includes(s.phase)) return;
  s.t += dt;
  s.timer -= dt;
  s.noticeTime = Math.max(0, s.noticeTime - dt);
  s.hit = Math.max(0, s.hit - dt);
  s.flash = Math.max(0, s.flash - dt);
  for (const a of s.actors) {
    a.cool = Math.max(0, a.cool - dt);
    a.muzzle = Math.max(0, (a.muzzle || 0) - dt);
    a.hurt = Math.max(0, (a.hurt || 0) - dt);
    if (a.reload > 0) {
      a.reload -= dt;
      if (a.reload <= 0) {
        const n = Math.min(weapons[a.w].mag - a.ammo, a.reserve);
        a.ammo += n;
        a.reserve -= n;
      }
    }
  }
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0);
  s.smokes = s.smokes.filter((e) => (e.life -= dt) > 0);

  if (s.phase === 'end') {
    if (s.timer <= 0) startRound(s);
    return;
  }
  const p = s.actors[0];
  if (p.alive) playerMotion(p, input, dt, (a, x, z) => moveAmong(s, a, x, z));
  if (s.phase === 'buy') {
    if (s.timer <= 0) {
      s.phase = 'live';
      s.timer = 100;
      log(s, 'KITE: Move out. Watch the north lane.');
    }
    return;
  }
  if (roundOutcome(s)) return;
  if (p.alive) interact(s, p, input.use, dt);
  if (s.phase !== 'live') return;
  bots(s, dt, (a, x, z) => moveAmong(s, a, x, z), (a, h, t) => interact(s, a, h, t));
  if (s.phase !== 'live') return;
  if (s.bomb) s.bomb.fuse -= dt;
  roundOutcome(s);
}
