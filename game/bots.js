// SNOWLINE — bot squad AI.
// Bots buy gear, patrol or push by lane, hold angles, take cover when hurt,
// investigate gunfire they hear, and plant/defuse. They fight in cycles
// (advance / fire / flank / relocate) so no two engagements look alike.
import { smokeBlocks } from './motion.js';
import { findRoute } from './navigation.js';
import { sites, walls, cover, log, buy, weapons } from './state.js';
import { blocked, fire, reload } from './combat.js';
import { eyeHeight } from './stance.js';

// Bots spend their money at round start: rifle if they can afford it, then a vest.
export function botBuy(s) {
  for (const a of s.actors.slice(1)) {
    buy(s, a, a.money >= 2700 ? 2 : a.money >= 1200 ? 1 : 0);
    buy(s, a, 'vest');
  }
}

// Is a point inside the arena and clear of prop footprints?
const clear = (x, z) =>
  Math.abs(x) < 20.6 && Math.abs(z) < 16.6
  && !cover.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.42 && Math.abs(z - p.z) < p.d / 2 + 0.42);

// Find a cover spot near a prop that hides the bot from an enemy: close
// enough to reach, far enough to matter, with the prop between them.
function shelter(a, e) {
  let best = null, score = Infinity;
  for (const p of cover) {
    if (p.kind === 'boundary' || p.h < 0.7) continue;
    const points = [];
    for (const side of [-1, 1]) {
      for (const off of [-0.65, 0, 0.65]) {
        points.push({ x: p.x + side * (p.w / 2 + 0.8), z: p.z + (off * p.d) / 2 });
        points.push({ x: p.x + (off * p.w) / 2, z: p.z + side * (p.d / 2 + 0.8) });
      }
    }
    for (const { x, z } of points) {
      const d = Math.hypot(x - a.x, z - a.z);
      if (d > 10 || d < 0.8 || !clear(x, z)) continue;
      if (!blocked(e.x, e.z, x, z, eyeHeight(e), 0.75)) continue;
      const cost = d + Math.abs(Math.hypot(x - e.x, z - e.z) - 12) * 0.15;
      if (cost < score) { score = cost; best = { x, z }; }
    }
  }
  return best;
}

// Walk toward a goal along the grid route, with a small sidestep when stuck.
function travel(a, goal, s, dt, move, speed = 3) {
  const g = waypoint(a, goal, s);
  const d = Math.hypot(g.x - a.x, g.z - a.z);
  if (d < 0.05) return;
  const dx = ((g.x - a.x) / d) * speed * dt;
  const dz = ((g.z - a.z) / d) * speed * dt;
  const ox = a.x, oz = a.z;
  move(a, dx, dz);
  if (Math.hypot(a.x - ox, a.z - oz) < 0.005) {
    a.routeTime = 0;
    move(a, Math.sin(s.t * 2 + a.id) * dt * 2, Math.cos(s.t * 2 + a.id) * dt * 2);
  }
  a.moveYaw = Math.atan2(-dx, -dz);
}

// One tick for every bot. move/interact are the simulation's movers so bots
// share collision and plant/defuse rules with the player.
export function bots(s, dt, move, interact) {
  for (const a of s.actors.slice(1)) {
    if (s.phase !== 'live') break;
    if (!a.alive) continue;
    const ox = a.x, oz = a.z;
    const enemies = s.actors
      .filter((b) => b.alive && b.team !== a.team
        && !blocked(a.x, a.z, b.x, b.z, eyeHeight(a), eyeHeight(b))
        && !smokeBlocks(s.smokes, a.x, a.z, b.x, b.z))
      .sort((b, c) => Math.hypot(b.x - a.x, b.z - a.z) - Math.hypot(c.x - a.x, c.z - a.z));
    const e = enemies[0];
    a.prone = false;
    a.crouch = false;

    if (a.ammo === 0 && !a.reload) reload(a);

    if (e) {
      // Visible enemy: fight.
      const distance = Math.hypot(e.x - a.x, e.z - a.z);
      a.lastKnown = { x: e.x, z: e.z, until: s.t + 5 };
      a.react += dt;

      if ((a.hurt > 0 || a.reload > 0 || a.hp < 40) && s.t >= (a.coverUntil || 0)) {
        a.coverGoal = shelter(a, e);
        a.coverUntil = s.t + 2.3;
        a.routeTime = 0;
      }
      if (a.coverGoal && s.t < a.coverUntil) {
        a.behavior = a.reload ? 'RELOAD / COVER' : 'TAKING COVER';
        const d = Math.hypot(a.coverGoal.x - a.x, a.coverGoal.z - a.z);
        if (d > 0.6) travel(a, a.coverGoal, s, dt, move, 3.4);
        else a.crouch = true;
      } else {
        a.coverGoal = null;
        const cycle = (s.t + a.id * 1.9) % 7;
        // Engagement cycle: advance, fire, flank, relocate.
        a.prone = distance > 9 && a.id % 3 === 2 && cycle > 3.8 && cycle < 5.3 && !a.reload;
        a.crouch = !a.prone && cycle > 2.8 && cycle < 3.8;
        if (a.prone) a.behavior = 'PRONE / FIRE';
        else if (a.crouch) a.behavior = 'CROUCH / FIRE';
        else {
          const yaw = Math.atan2(a.x - e.x, a.z - e.z);
          const strafe = Math.sin((s.t + a.id) * 1.2) > 0 ? 1 : -1;
          const preferred = a.id % 3 === 2 ? 16 : a.w === 1 ? 7 : 11;
          const approach = distance > preferred ? 1.9 : distance < preferred - 4 ? -1.8 : 0.15;
          const speed = a.reload ? 2.5 : 1.7;
          const dx = (-Math.sin(yaw) * approach + Math.cos(yaw) * strafe * speed) * dt;
          const dz = (-Math.cos(yaw) * approach - Math.sin(yaw) * strafe * speed) * dt;
          move(a, dx, dz);
          a.behavior = distance > 10 ? 'ADVANCING' : 'FLANK / RELOCATE';
          if (Math.hypot(a.x - ox, a.z - oz) < 0.007) {
            const flank = { x: a.x + Math.cos(yaw) * strafe * 3, z: a.z - Math.sin(yaw) * strafe * 3 };
            if (clear(flank.x, flank.z)) travel(a, flank, s, dt, move);
            else { a.routeTime = 0; travel(a, sites[a.id % 2], s, dt, move); }
          }
        }
      }

      a.yaw = Math.atan2(a.x - e.x, a.z - e.z);
      a.crouchAmount = (a.crouchAmount || 0)
        + ((a.crouch ? 1 : 0) - (a.crouchAmount || 0)) * Math.min(1, dt * 10);
      a.proneAmount = (a.proneAmount || 0)
        + ((a.prone ? 1 : 0) - (a.proneAmount || 0)) * Math.min(1, dt * 9);
      const moving = Math.hypot(a.x - ox, a.z - oz) > dt * 0.4;
      const burst = (s.t + a.id * 0.37) % 1.25 < 0.82;
      a.pitch = Math.atan2(eyeHeight(a) - (eyeHeight(e) - 0.18), Math.max(1, distance));
      // Reaction delay keeps rounds from ending in seconds: bots must see
      // the enemy for ~0.25 s (plus a per-bot offset) before firing.
      if (a.react > 0.25 + (a.id % 3) * 0.1 && burst && !a.coverGoal) {
        fire(s, a, a.yaw, a.pitch, moving, a.prone || a.crouch);
      }
      if (s.t - (a.lastRadio ?? -20) > 8) {
        a.lastRadio = s.t;
        log(s, `${a.name}: Contact! ${a.behavior}`);
      }
      // A bot that plants or defuses must restart an uninterrupted hold.
      a.progress = 0;
    } else {
      // No visible enemy: rotate, patrol, investigate, or work the objective.
      a.react = 0;
      a.proneAmount = (a.proneAmount || 0) * Math.max(0, 1 - dt * 9);
      a.crouchAmount = (a.crouchAmount || 0) * Math.max(0, 1 - dt * 10);
      a.coverGoal = null;
      const heard = s.gunfire?.findLast((shot) =>
        shot.team !== a.team && s.t - shot.t < 3 && Math.hypot(shot.x - a.x, shot.z - a.z) < 23);
      if (heard && !a.lastKnown) a.lastKnown = { x: heard.x, z: heard.z, until: s.t + 4 };
      if (a.lastKnown && a.lastKnown.until < s.t) a.lastKnown = null;

      let goal;
      const site = sites[a.id % 2];
      if (s.bomb) {
        if (a.team === 1) { goal = s.bomb; a.behavior = 'ROTATE / DEFUSE'; }
        else {
          const angle = a.id * 1.7;
          goal = {
            x: Math.max(3, Math.min(19, s.bomb.x + Math.cos(angle) * 4)),
            z: Math.max(-15, Math.min(15, s.bomb.z + Math.sin(angle) * 4)),
          };
          a.behavior = 'GUARD CHARGE';
        }
      } else if (a.lastKnown) {
        goal = a.lastKnown;
        a.behavior = 'INVESTIGATE CONTACT';
      } else if (a.team === 0) {
        const lane = [-12, 0, 12][a.id % 3];
        goal = a.x < -8 ? { x: -6, z: lane } : a.x < 7 ? { x: 7, z: lane } : site;
        a.behavior = 'PUSH ' + site.name[0];
      } else {
        const points = a.id % 2
          ? [{ x: 12, z: 10 }, { x: 15.8, z: 15 }, { x: 10.8, z: 12 }, { x: 13, z: 8.9 }]
          : [{ x: 12, z: -10 }, { x: 15.8, z: -15 }, { x: 10.8, z: -12 }, { x: 13, z: -8.9 }];
        goal = points[(Math.floor(s.t / 5) + a.id) % points.length];
        a.behavior = 'PATROL ' + site.name[0];
      }

      if (Math.hypot(goal.x - a.x, goal.z - a.z) > 1.1) {
        a.progress = 0;
        travel(a, goal, s, dt, move, a.reload ? 2.4 : 3.1);
        a.yaw = a.moveYaw ?? a.yaw;
      } else if ((a.team === 0 && !s.bomb) || (a.team === 1 && s.bomb)) {
        interact(a, true, dt);
      }
    }

    a.vx = (a.x - ox) / dt;
    a.vz = (a.z - oz) / dt;
    a.sprint = Math.hypot(a.vx, a.vz) > 3.2;
  }
}

// Is the straight segment between two points free of props?
function walkClear(a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
  for (let i = 1; i <= n; i++) {
    if (!clear(a.x + (b.x - a.x) * (i / n), a.z + (b.z - a.z) * (i / n))) return false;
  }
  return true;
}

// Next waypoint toward a goal, replanning at most 4 times a second and
// skipping ahead along the route whenever the shortcut is walkable.
function waypoint(a, goal, s) {
  if (s.t >= (a.nextPathAt || 0)
    && (!a.route || s.t >= (a.routeTime || 0)
      || Math.hypot(goal.x - a.goalX, goal.z - a.goalZ) > 2)) {
    a.goalX = goal.x;
    a.goalZ = goal.z;
    a.routeTime = s.t + 1;
    a.nextPathAt = s.t + 0.25;
    a.route = findRoute(a, goal);
  }
  a.route ??= [];
  while (a.route.length && Math.hypot(a.route[0].x - a.x, a.route[0].z - a.z) < 0.35) {
    a.route.shift();
  }
  for (let i = Math.min(4, a.route.length - 1); i > 0; i--) {
    if (walkClear(a, a.route[i])) { a.route.splice(0, i); break; }
  }
  return a.route[0] || goal;
}
