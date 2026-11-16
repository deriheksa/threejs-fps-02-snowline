// SNOWLINE — posture geometry: where a soldier's eyes and head are, and
// whether a shot ray crosses their body. Standing, crouched and prone bodies
// have different heights and footprints.

// 0 = standing, 1 = fully prone (proneAmount is a 0..1 blend).
export const proneAmount = (a) => a.proneAmount ?? (a.prone ? 1 : 0);

// Eye height above the soldier's feet.
export const eyeHeight = (a) =>
  a.y + 1.6 - (a.crouchAmount ?? (a.crouch ? 1 : 0)) * 0.52 - proneAmount(a) * 1.16;

// Top of the head.
export const bodyTop = (a) =>
  a.y + 1.92 - (a.crouchAmount ?? (a.crouch ? 1 : 0)) * 0.52 - proneAmount(a) * 1.22;

// Distance along a horizontal ray (dx, dz) from (x, z) to a soldier's body,
// or null when the ray misses. A standing soldier is a circle of radius
// 0.34 m; a prone soldier is a 0.68 x 2.0 m capsule along their facing.
export function actorRay(a, x, z, dx, dz) {
  const px = x - a.x, pz = z - a.z;
  if (proneAmount(a) < 0.5) {
    const t = -px * dx - pz * dz;
    return Math.abs(px * dz - pz * dx) < 0.34 ? t : null;
  }
  const c = Math.cos(a.yaw || 0), s = Math.sin(a.yaw || 0);
  let lo = 0, hi = 80;
  for (const [p, v, r] of [
    [px * c - pz * s, dx * c - dz * s, 0.34],
    [px * s + pz * c, dx * s + dz * c, 1.0],
  ]) {
    if (Math.abs(v) < 1e-8) {
      if (Math.abs(p) > r) return null;
    } else {
      const t1 = (-r - p) / v, t2 = (r - p) / v;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    }
  }
  return lo <= hi ? Math.max(0.01, lo) : null;
}
