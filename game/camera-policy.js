// SNOWLINE — spectator camera policy.
// The observer is always an alive ally: whoever is closest to the action
// and is not inside a solid (a wall, a roofline or a prop face). After death
// the camera goes to the next valid ally; N (or the C key) cycles manually.
// actorVisible answers a strict boolean: in first person your own body is
// hidden, and the spectator never sees the ally they are currently watching.
import { cover } from './terrain.js';
import { blocked } from './combat.js';

// Can a camera sit at the actor's head without clipping into a prop?
function headClear(a) {
  const y = (a.y || 0) + 1.6;
  for (const p of cover) {
    if (p.h > 2 && Math.abs(a.x - p.x) < p.w / 2 + 0.35
      && Math.abs(a.z - p.z) < p.d / 2 + 0.35 && y < p.h) return false;
  }
  return true;
}

// Is it safe to watch actor a from observer me? False when the two stand
// inside each other (the camera would be inside a body) or when a's head
// is inside a solid prop.
export function safeBodyVisible(a, me) {
  if (!a || !me) return false;
  if (Math.hypot(a.x - me.x, a.z - me.z) < 0.68) return false;
  return headClear(a);
}

// Pick an ally to watch: alive, on the observer's team, visible, near the
// action. prefer (or me.spectateId) pins a specific ally when they are
// alive and watchable.
export function observerActor(s, me, prefer = null) {
  const team = me?.team ?? 0;
  const alive = s.actors.filter((a) => a.alive && a.team === team && a.id !== me?.id);
  const wantedId = prefer?.id ?? me?.spectateId;
  if (wantedId !== undefined) {
    const wanted = alive.find((a) => a.id === wantedId && safeBodyVisible(a, me));
    if (wanted) return wanted;
  }
  const candidates = alive
    .filter((a) => safeBodyVisible(a, me))
    .sort((a, b) => {
      const threat = (x) => Math.min(...s.actors
        .filter((e) => e.team !== team && e.alive)
        .map((e) => Math.hypot(e.x - x.x, e.z - x.z)), 20);
      return threat(a) - threat(b);
    });
  return candidates[0] || alive[0] || null;
}

// Strict boolean: can the observer see this actor? Your own body is hidden
// in first person (mode falsy) and shown in third person; the ally being
// spectated is hidden from the spectator; everyone else needs line of sight.
export function actorVisible(a, me, mode, watching) {
  if (!a?.alive) return false;
  if (a === me && !mode) return false;
  if (a === me) return true;
  if (watching && a === watching) return false;
  if (a.x === undefined || me?.x === undefined) return true;
  const dx = a.x - me.x, dz = a.z - me.z;
  if (Math.hypot(dx, dz) > 38) return false;
  return !blocked(me.x, me.z, a.x, a.z, (me.y || 0) + 1.6, (a.y || 0) + 1.6);
}

// The next ally after the current one, cycling through the alive team.
// The choice is stored on me.spectateId so the next observerActor call
// keeps watching the same ally.
export function nextObserver(s, me, current) {
  const team = me?.team ?? 0;
  const alive = s.actors.filter((a) => a.alive && a.team === team && a.id !== me?.id);
  if (!alive.length) return null;
  const here = current || observerActor(s, me);
  const next = alive.find((a) => a.id > (here?.id ?? -1)) || alive[0];
  if (me) me.spectateId = next.id;
  return next;
}

// Spectator FOV: a living ally aiming a DMR through the scope narrows the
// view to 28 degrees; anything else (including a dead player's scope) uses
// the base FOV.
export function spectatorFov(watching, scoped = false, baseFov = 72) {
  if (watching?.alive && watching.w === 4 && scoped) return 28;
  return baseFov;
}
