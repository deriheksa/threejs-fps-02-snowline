// SNOWLINE — radar math, enemy contact tracking, and the radar instrument.
// radarPoint converts arena coordinates into radar pixels; radarContacts
// tracks enemies with a 3-second last-seen memory; drawRadar paints the
// whole instrument.
import { sites, walls } from './state.js';
import { blocked } from './combat.js';
import { smokeBlocks } from './motion.js';
import { eyeHeight } from './stance.js';

// Arena (x, z) -> radar pixel (x, y) inside a radar centred at (px, py).
// yaw rotates the radar so the player's forward vector stays at the top
// (heading-up); scale converts metres to pixels.
export function radarPoint(x, z, me, yaw = 0, scale = 2.4, px = 100, py = px) {
  const dx = x - me.x, dz = z - me.z;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    x: (dx * c - dz * s) * scale + px,
    y: (dx * s + dz * c) * scale + py,
  };
}

// Enemy contacts for team, with a last-seen memory (memory is a Map keyed
// by actor id). A visible enemy reports live coordinates; a hidden one
// reports its last-seen coordinates for 3 seconds, then drops off.
export function radarContacts(s, team, memory = new Map()) {
  const contacts = [];
  for (const a of s.actors) {
    if (!a.alive) continue;
    const friend = a.team === team;
    const me = s.actors.find((x) => x.team === team && x.id === 0) || s.actors[0];
    const visible = !blocked(me.x, me.z, a.x, a.z, eyeHeight(me), eyeHeight(a))
      && !smokeBlocks(s.smokes, me.x, me.z, a.x, a.z);
    if (visible) {
      memory.set(a.id, { x: a.x, z: a.z, t: s.t });
      contacts.push({ id: a.id, friend, visible: true, x: a.x, z: a.z, t: s.t });
    } else if (!friend) {
      const last = memory.get(a.id);
      if (last && s.t - last.t < 3) {
        contacts.push({ id: a.id, friend, visible: false, x: last.x, z: last.z, t: last.t });
      }
    } else {
      contacts.push({ id: a.id, friend, visible: false, x: a.x, z: a.z, t: s.t });
    }
  }
  return contacts;
}

// Paint the radar: dark disc, walls, site markers, allies, and enemy
// contacts (bright when visible, faded at their last-seen spot when hidden).
export function drawRadar(ctx, s, me, x, y, px, yaw = 0) {
  ctx.save();
  ctx.clearRect(x - px, y - px, px * 2, px * 2);
  ctx.beginPath();
  ctx.arc(x, y, px, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 10, 15, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 220, 255, 0.35)';
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, px, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(140, 210, 250, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [wx, wz, w, d] of walls) {
    const corners = [
      [wx - w / 2, wz - d / 2], [wx + w / 2, wz - d / 2],
      [wx + w / 2, wz + d / 2], [wx - w / 2, wz + d / 2],
    ].map(([cx, cz]) => radarPoint(cx, cz, me, yaw, 2.4, px, px));
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      ctx.moveTo(x + a.x - px, y + a.y - px);
      ctx.lineTo(x + b.x - px, y + b.y - px);
    }
  }
  ctx.stroke();

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const site of sites) {
    const p = radarPoint(site.x, site.z, me, yaw, 2.4, px, px);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(site.name[0], x + p.x - px, y + p.y - px);
  }
  const memory = drawRadar.memory ??= new Map();
  for (const c of radarContacts(s, me.team, memory)) {
    const p = radarPoint(c.x, c.z, me, yaw, 2.4, px, px);
    ctx.fillStyle = c.friend ? '#5fb7e8' : c.visible ? '#ff4d4d' : 'rgba(255, 77, 77, 0.4)';
    ctx.beginPath();
    ctx.arc(x + p.x - px, y + p.y - px, c.id === 0 ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Player wedge: always up in north-up mode, rotating with the player
  // in heading-up mode.
  const angle = yaw ? 0 : -me.yaw;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x + Math.sin(angle) * 6, y - Math.cos(angle) * 6);
  ctx.lineTo(x + Math.sin(angle + 2.6) * 5, y - Math.cos(angle + 2.6) * 5);
  ctx.lineTo(x + Math.sin(angle - 2.6) * 5, y - Math.cos(angle - 2.6) * 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
