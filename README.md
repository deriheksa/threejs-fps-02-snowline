# SNOWLINE — Alpine Gondola Station Tactical FPS

A complete, original Counter-Strike-style round-based tactical FPS built with
three.js 0.187.0. Submitted to **threejs-fps-02** on make.fun.

## The game

- **5v5 plant/defuse** — SUMMIT (attack, blue) vs VALE (defend, red), first
  to 7 rounds, max 12, 6–6 draws.
- **The map** — an alpine gondola station, ~44×36 m, with three CS-style
  lanes (A-long / Mid / B-long, 5 m wide, separated by tall station wings),
  chokepoints and cover every ~7 m, and two walled sites with two narrow
  entries each: **A · Gondola Hall** (red gondola cabin) and **B · Cable
  Yard** (cable-wheel towers). Blue-hour light, snow, pines and ridge peaks.
- **Economy** — $800 start; kill +$300, win +$900, loss +$600, plant +$300.
  REQUISITION buy menu: 5 weapons (Pika P9 $200, Marmot SMG $1200,
  Ibex AR $2700, Lynx-12 $1100, Chamois DMR $4500) + frag/flash/smoke,
  vest, helmet, defuse kit (defenders only).
- **Gunplay** — recoil, spread, headshots ×2, tracers, muzzle flash, smoke
  clouds, ADS, crouch/prone, jump with coyote time, fixed 60 Hz simulation.
- **Bots** — routed (grid BFS), patrol/hold/strafe/prone, take cover when
  hurt or reloading, investigate gunfire they hear, plant/defuse, buy gear,
  and call out contacts on the radio.
- **HUD** — radar/minimap (heading-up or north-up), scoreboard, kill feed,
  radio log, vitals, ammo, objective banner, damage vignette, flash overlay,
  DMR scope. Field console (F) with map, arsenal, settings, controls and
  squad tabs. Touch controls (joystick + pads). Spectator camera after death.

## Run it

```sh
# serve the game/ folder statically (any static server works)
npx serve game
# or: python3 -m http.server -d game
```

Open http://localhost:3000 (or the port shown), click DEPLOY, and play.
`?shot=start|play|end&seed=1` stages deterministic scenes for screenshots.

## Tests

```sh
node --test tests/*.test.js   # 59 tests, all passing
```

## Layout

- `game/` — the game (ES modules, static, offline, three.js 0.187.0
  vendored byte-for-byte under `game/vendor/three/`).
- `game/main.js` — bootstrap: menus, fixed-step loop, actions.
- `game/state.js`, `game/simulation.js`, `game/combat.js`, `game/bots.js` —
  match data, the 60 Hz loop, shooting/damage, bot AI.
- `game/terrain.js`, `game/navigation.js` — the one authoritative map
  geometry list and grid pathfinding.
- `game/view.js`, `game/actors.js`, `game/models.js`, `game/world.js` and
  the `*-architecture` / `station-detail` / `alpine` / `yard` modules —
  renderer, HUD, voxel soldiers, weapon models, the station scene.
- `main.ts` — the official kit entrypoint (unchanged), writes the dossier.
- `screenshots/` — three real WebGL gameplay renders (1280×720 JPEG).
