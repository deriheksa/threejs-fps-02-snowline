// SNOWLINE — grid pathfinding.
// Obstacle clearance is computed once at load; every route query is a plain
// breadth-first search over a 41 x 33 integer grid (1 m cells).
import { cover } from './terrain.js';

const GRID_W = 41, GRID_H = 33, CELLS = GRID_W * GRID_H;
const HALF_X = 20, HALF_Z = 16;
const walkable = new Uint8Array(CELLS);

function cellIndex(x, z) {
  return (z + HALF_Z) * GRID_W + x + HALF_X;
}

// A cell is walkable when no prop footprint comes within 0.55 m of its centre.
for (let z = -HALF_Z; z <= HALF_Z; z++) {
  for (let x = -HALF_X; x <= HALF_X; x++) {
    walkable[cellIndex(x, z)] = cover.some((p) =>
      Math.abs(x - p.x) < p.w / 2 + 0.55 && Math.abs(z - p.z) < p.d / 2 + 0.55
    ) ? 0 : 1;
  }
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Shortest walkable route from an actor to a goal, as a list of {x, z} cells.
// Returns [] when already there, and the reversed partial path when blocked.
export function findRoute(a, goal) {
  const sx = Math.max(-HALF_X, Math.min(HALF_X, Math.round(a.x)));
  const sz = Math.max(-HALF_Z, Math.min(HALF_Z, Math.round(a.z)));
  const start = cellIndex(sx, sz);
  const prev = new Int16Array(CELLS).fill(-1);
  const queue = new Int16Array(CELLS);
  let head = 0, tail = 1, found = -1;
  queue[0] = start;
  prev[start] = -2;

  while (head < tail) {
    const id = queue[head++];
    const x = (id % GRID_W) - HALF_X;
    const z = Math.floor(id / GRID_W) - HALF_Z;
    if (Math.hypot(x - goal.x, z - goal.z) < 1.5) { found = id; break; }
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x + dx, nz = z + dz;
      if (nx < -HALF_X || nx > HALF_X || nz < -HALF_Z || nz > HALF_Z) continue;
      const ni = cellIndex(nx, nz);
      if (walkable[ni] && prev[ni] === -1) { prev[ni] = id; queue[tail++] = ni; }
    }
  }

  const route = [];
  while (found >= 0 && found !== start) {
    route.push({ x: (found % GRID_W) - HALF_X, z: Math.floor(found / GRID_W) - HALF_Z });
    found = prev[found];
  }
  return route.reverse();
}
