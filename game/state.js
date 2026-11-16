// SNOWLINE — match data: arsenal, sites, soldiers, economy.
// All tuning numbers below are the match design; the simulation, combat and
// bot modules read them but never hard-code their own copies.

// name / price / damage per hit / rounds per minute / magazine / useful range (m)
export const weapons = [
  { name: 'Pika P9',    price: 200,  dmg: 26, rpm: 360, mag: 15, range: 28 },
  { name: 'Marmot SMG', price: 1200, dmg: 22, rpm: 800, mag: 30, range: 20 },
  { name: 'Ibex AR',    price: 2700, dmg: 34, rpm: 600, mag: 30, range: 42 },
  { name: 'Lynx-12',    price: 1100, dmg: 16, rpm: 90,  mag: 8,  range: 12, pellets: 7 },
  { name: 'Chamois DMR',price: 4500, dmg: 65, rpm: 140, mag: 10, range: 65 },
];

// Objective sites. x/z are arena coordinates; the name feeds HUD + radar.
export const sites = [
  { x: 13, z: -10, name: 'A · GONDOLA HALL' },
  { x: 13, z: 11,  name: 'B · CABLE YARD' },
];

// The single authoritative layout list lives in terrain.js; state re-exports
// the pieces the combat and simulation modules need.
export { walls, cover, surfaceAt } from './terrain.js';

const CALLSIGNS = ['', 'KITE', 'MICA', 'FLINT', 'NOVA', 'RIME', 'FROST', 'SLATE', 'ECHO', 'DRIFT'];

// One soldier. id 0 is the human player; 1-4 are allies, 5-9 are enemies.
// team 0 = SUMMIT (attack, blue), team 1 = VALE (defend, red).
export function actor(id, team, x, z) {
  return {
    id,
    name: id === 0 ? 'YOU' : CALLSIGNS[id],
    team, x, z,
    y: 0, vy: 0, grounded: true,
    crouch: false, crouchAmount: 0,
    jumpBuffer: 0, jumpLatch: false, land: 0,
    hp: 100, armor: 0, money: 800,
    w: 0, ammo: 15, reserve: 90,
    grenades: { frag: 0, flash: 0, smoke: 0 },
    cool: 0, reload: 0, alive: true,
    kills: 0, deaths: 0, react: 0, progress: 0,
    kit: false, helmet: false,
  };
}

// Fresh match state. Soldiers spawn in two lines of five at x = -18 / +18.
export function createState(seed = 42) {
  return {
    seed,
    t: 0, round: 0, score: [0, 0],
    phase: 'menu', timer: 15, paused: false,
    notice: '', noticeTime: 0,
    actors: Array.from({ length: 10 }, (_, i) =>
      actor(i, i < 5 ? 0 : 1, i < 5 ? -18 : 18, (i % 5 - 2) * 3)),
    bomb: null, feed: [], radio: ['SUMMIT / Secure the ridge.'],
    effects: [], gunfire: [], smokes: [], plant: 0, hit: 0, flash: 0, roundEnd: 0,
  };
}

// Deterministic LCG so seeded matches replay identically.
export function random(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

// Push a line into the radio log (newest first, capped at four).
export function log(s, msg) {
  s.radio.unshift(msg);
  s.radio.length = Math.min(s.radio.length, 4);
}

const GEAR_PRICES = { frag: 300, flash: 200, smoke: 300, vest: 650, helmet: 1000, kit: 400 };

// Buy a weapon (by index) or a piece of gear (by name) during the buy phase.
// Returns true on a completed purchase, false otherwise.
export function buy(s, a, type) {
  if (s.phase !== 'buy' || !a.alive) return false;
  let price;
  if (typeof type === 'number') {
    if (!weapons[type]) return false;
    price = weapons[type].price;
    if (a.money < price) return false;
    a.w = type;
    a.ammo = weapons[type].mag;
    a.reserve = a.ammo * 4;
  } else {
    price = GEAR_PRICES[type];
    if (!price || a.money < price) return false;
    if (type === 'kit' && a.team !== 1) return false; // defenders only
    if (type in a.grenades) {
      if (a.grenades[type] >= 2) return false;
      a.grenades[type]++;
    }
    if (type === 'vest' || type === 'helmet') a.armor = 100;
    if (type === 'helmet') a.helmet = true;
    if (type === 'kit') a.kit = true;
  }
  a.money -= price;
  return true;
}
