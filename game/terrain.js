// SNOWLINE — one authoritative geometry list.
// Rendering, player collision, bot navigation and bullets all read this list,
// so a prop that looks solid is always solid. Coordinates are arena metres:
// x runs west(-) to east(+), z runs north(-, site A) to south(+, site B).
// The arena is ~44 x 36 m: three 5 m lanes (A-long / Mid / B-long) separated
// by tall station wings, with two-door walled sites at each end.

// kind 'tacticalwall' is a full-height wall; anything else is low cover.
// w = width along x, d = depth along z, h = height.
function solid(x, z, w, d, h = 4.8) {
  return { kind: 'tacticalwall', x, z, w, d, h };
}
function prop(kind, x, z, w, d, h) {
  return { kind, x, z, w, d, h };
}

export const cover = [
  // Outer boundary.
  solid(-22, 0, 1, 36), solid(22, 0, 1, 36),
  solid(0, -18, 44, 1), solid(0, 18, 44, 1),

  // Station wings separating the three lanes.
  solid(-2.5, -16.25, 23, 3.5), solid(-2.5, 16.25, 23, 3.5),
  solid(-10.75, -6, 6.5, 7), solid(-2, -6, 5, 7), solid(6.25, -6, 5.5, 7),
  solid(-9.25, 6, 9.5, 7), solid(1, 6, 5, 7), solid(7.75, 6, 2.5, 7),

  // Offset Mid baffles break the end-to-end sightline; each passage is 2.3 m.
  solid(-10, -1.15, 0.5, 2.7, 3.6), solid(-2, 1.15, 0.5, 2.7, 3.6),
  solid(6, -1.15, 0.5, 2.7, 3.6),

  // Long-lane chokepoints: 2.4 m openings with alternating cover.
  solid(-8, -13.2, 0.5, 2.6, 3.8), solid(-8, 10.8, 0.5, 2.6, 3.8),

  // Site A room: west entry (z = -12) and south entry (x = 13), both 2.4 m.
  solid(9, -14.85, 0.5, 3.3), solid(9, -9.4, 0.5, 2.8),
  solid(17, -12.25, 0.5, 8.5), solid(13, -16.5, 8.5, 0.5),
  solid(10.4, -8, 2.8, 0.5), solid(15.6, -8, 2.8, 0.5),

  // Site B room: west entry (z = 12) and north entry (x = 13), both 2.4 m.
  solid(9, 14.85, 0.5, 3.3), solid(9, 9.4, 0.5, 2.8),
  solid(17, 12.25, 0.5, 8.5), solid(13, 16.5, 8.5, 0.5),
  solid(10.4, 8, 2.8, 0.5), solid(15.6, 8, 2.8, 0.5),

  // Closed service blocks remove unused open strips behind the sites.
  solid(19.5, -12.75, 4.5, 9.5), solid(19.5, 12.75, 4.5, 9.5),

  // Defender connectors are five metres wide; corners hide the sites from Mid.
  solid(10.25, -5.25, 0.5, 5.5), solid(15.75, -5.25, 0.5, 5.5),
  solid(10.25, 5.25, 0.5, 5.5), solid(15.75, 5.25, 0.5, 5.5),

  // Lane cover: cargo crates, spaced so no stretch runs open for long.
  prop('cargo', -12, -13.5, 1.4, 1.3, 1.2), prop('cargo', -5, -10.5, 1.4, 1.2, 1.4),
  prop('cargo', 2, -13.3, 1.6, 1.4, 1.5),
  prop('cargo', -12, 10.5, 1.4, 1.3, 1.2), prop('cargo', -5, 13.4, 1.4, 1.2, 1.4),
  prop('cargo', 2, 10.5, 1.6, 1.4, 1.5),
  prop('cargo', -6, 1.5, 1.3, 1, 1.2), prop('cargo', 2, -1.5, 1.3, 1, 1.2),

  // Spawn-side props: ticket booth, ski rack, snowbank, cargo.
  ...[-10, -3, 4, 11].map((z) => ({
    kind: z === -10 ? 'booth' : z === 11 ? 'skirack' : z === 4 ? 'snowbank' : 'cargo',
    x: -20, z, w: 1.3, d: 1.2, h: z === -10 ? 2.6 : z === 11 ? 1.8 : 1.3,
  })),
  ...[-5, 5].map((z) => prop('cargo', 20, z, 1.1, 1.3, 1.2)),

  // Site-side crates.
  prop('cargo', 10.7, -15, 1.3, 1.3, 1.4), prop('cargo', 10.7, 15, 1.3, 1.3, 1.4),

  // Landmarks: the red gondola (site A) and the cable-wheel towers (site B).
  prop('gondola', 13, -13, 4.8, 2.6, 3.3),
  prop('tower', 11, 14, 0.42, 0.42, 6.2), prop('tower', 15, 14, 0.42, 0.42, 6.2),
];

// Lane centres (z) and width, used by bot routing and the map UI.
export const laneCenters = [-12, 0, 12];
export const laneWidth = 5;

// Flat [x, z, w, d] list for the 2D line-of-sight math in combat.js.
export const walls = cover.map((p) => [p.x, p.z, p.w, p.d]);

// Ground height at a point: the top of the tallest prop covering it.
export function surfaceAt(x, z) {
  let h = 0;
  for (const p of cover) {
    if (Math.abs(x - p.x) < p.w / 2 + 0.27 && Math.abs(z - p.z) < p.d / 2 + 0.27) {
      h = Math.max(h, p.h);
    }
  }
  return h;
}
