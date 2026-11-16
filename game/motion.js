// SNOWLINE — presentation springs, walk cycle, smoke vision.
// Springs are integrated in fixed 8 ms sub-steps so camera feel never
// depends on frame rate.

// One damped-spring step toward a target. Returns [value, velocity].
export function spring(value, velocity, target, dt, stiffness = 150, damping = 22) {
  dt = Math.max(0, Math.min(0.05, dt));
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += ((target - value) * stiffness - velocity * damping) * h;
    value += velocity * h;
  }
  return [value, velocity];
}

// Foot position inside one walk cycle. phase is in radians; stance is the
// fraction of the cycle the foot spends planted on the ground.
export function stridePose(phase, stride, lift, stance = 0.62) {
  const t = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  if (t < stance) {
    return { travel: -stride + (2 * stride * t) / stance, lift: 0 };
  }
  const s = (t - stance) / (1 - stance);
  return { travel: Math.cos(s * Math.PI) * stride, lift: Math.sin(s * Math.PI) * lift };
}

// Does any live smoke cloud block the segment from (x, z) to (xx, zz)?
// A cloud blocks when the segment passes within 3 m of its centre.
export function smokeBlocks(smokes, x, z, xx, zz) {
  const dx = xx - x, dz = zz - z;
  const n = dx * dx + dz * dz;
  return smokes.some((c) => {
    if (c.life <= 0) return false;
    const t = n ? Math.max(0, Math.min(1, ((c.x - x) * dx + (c.z - z) * dz) / n)) : 0;
    return Math.hypot(x + t * dx - c.x, z + t * dz - c.z) < 3;
  });
}

// Per-frame camera feel: ADS easing, recoil kick, roll from turning, landing
// dip, walk bob and reload sway. Returns the frame's offsets.
export function viewMotion() {
  const q = {
    ads: 0, av: 0, kick: 0, kv: 0, roll: 0, rv: 0,
    drop: 0, dv: 0, phase: 0, lastShot: 0, lastYaw: null, lastPitch: 0,
  };
  return (a, input, dt) => {
    const speed = Math.min(7, Math.hypot(a.vx || 0, a.vz || 0));
    const moving = speed > 0.15;
    const air = a.grounded === false;
    q.phase += speed * dt * (a.sprint ? 4.7 : 5.6);
    if (a.lastShot && a.lastShot !== q.lastShot) {
      q.kv += a.w === 3 ? 2.8 : a.w === 4 ? 1.8 : 1.1;
      q.lastShot = a.lastShot;
    }
    const turn = q.lastYaw === null ? 0
      : Math.atan2(Math.sin(input.yaw - q.lastYaw), Math.cos(input.yaw - q.lastYaw));
    q.lastYaw = input.yaw;
    [q.ads, q.av] = spring(q.ads, q.av, input.aim ? 1 : 0, dt, 125, 23);
    [q.kick, q.kv] = spring(q.kick, q.kv, 0, dt, 185, 24);
    [q.roll, q.rv] = spring(q.roll, q.rv,
      Math.max(-0.045, Math.min(0.045, -turn * 0.5 + (a.vx || 0) * Math.cos(input.yaw) * 0.003)),
      dt, 110, 21);
    [q.drop, q.dv] = spring(q.drop, q.dv, (a.land || 0) * 0.12 + (air ? 0.008 : 0), dt, 120, 18);
    const bob = moving && !air
      ? Math.sin(q.phase) * Math.min(0.018, speed * 0.003) * (1 - q.ads * 0.75) : 0;
    const reload = a.reload > 0 ? Math.sin(Math.min(1, a.reload / 2.1) * Math.PI) : 0;
    return { ads: q.ads, kick: q.kick, roll: q.roll, bob, drop: q.drop, reload, speed };
  };
}
