// SNOWLINE — renderer and HUD.
// One view object owns the WebGL renderer, the camera (first person,
// third person, spectator), the weapon view model, tracers / muzzle flash /
// smoke / explosions, and every HUD element. The simulation never touches
// the DOM; view.js reads state and writes pixels.
import * as THREE from 'three';
import { weapons, sites } from './state.js';
import { eyeHeight } from './stance.js';
import { viewMotion } from './motion.js';
import { drawRadar } from './radar.js';
import { preloadActors, animatedSoldier } from './actors.js';
import { weaponModel } from './models.js';
import { world } from './world.js';
import { observerActor, nextObserver, spectatorFov } from './camera-policy.js';
import { sound } from './audio.js';
import { damage } from './combat.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.max(0, Math.ceil(n));

export function view(s, prefs) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.appendChild(renderer.domElement);

  const scene = world();
  const camera = new THREE.PerspectiveCamera(prefs.fov, innerWidth / innerHeight, 0.05, 220);
  // A warm fill light rides with the camera so the view-model gun and
  // nearby props never go pitch black. It has to be strong (the gun's
  // materials are dark and ACES crushes the mids): at 0.9 the receiver
  // read as a flat black slab in the screenshots.
  const camLight = new THREE.PointLight(0xfff2dd, 1.5, 4, 1.5);
  camera.add(camLight);
  const motion = viewMotion();
  let gunMesh = null;
  // The view-model gun is built pointing along its local +x (barrel to the
  // right). Rotating the group a quarter turn about Y aims the barrel down
  // the camera's -z, so the player sees a rifle pointing where they look —
  // the way the top entries' big view-models read — instead of a sideways
  // bar. Scaled up and pulled closer so it fills the lower right like a
  // real rifle instead of a distant pistol.
  const placeGun = (g) => {
    g.rotation.y = Math.PI / 2;
    g.scale.setScalar(1.0);
    g.position.set(0.34, -0.3, -0.55);
    return g;
  };
  camera.add(gunMesh = placeGun(weaponModel(0)));
  // Muzzle flash: a star-shaped additive sprite at the barrel tip, shown
  // while the player's muzzle timer runs. The top entries all show the
  // flash star in their fight shots; without it the gun looks unfired.
  // A spiked star, not a soft blob: a radial gradient alone read as a
  // white sun hanging off the barrel in the staged stills.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const fgrad = fctx?.createRadialGradient?.(32, 32, 1, 32, 32, 32);
  if (fgrad && typeof fgrad.addColorStop === 'function') {
    fgrad.addColorStop(0, 'rgba(255,240,200,1)');
    fgrad.addColorStop(0.35, 'rgba(255,180,60,0.9)');
    fgrad.addColorStop(1, 'rgba(255,120,20,0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 64, 64);
    // Four spikes: long horizontal/vertical, shorter diagonal.
    fctx.fillStyle = 'rgba(255,220,140,0.95)';
    for (const [w, h, x, y] of [
      [56, 5, 4, 29.5], [5, 56, 29.5, 4],
      [34, 4, 15, 30], [4, 34, 30, 15],
    ]) fctx.fillRect(x, y, w, h);
  } else if (fctx) {
    fctx.fillStyle = '#ffb347';
    fctx.fillRect(0, 0, 64, 64);
  }
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  muzzleFlash.scale.set(0.5, 0.5, 1);
  muzzleFlash.position.set(0.34, -0.28, -1.3);
  muzzleFlash.visible = false;
  camera.add(muzzleFlash);
  // Bot muzzle flashes: small additive sprites at recent gunfire spots, so
  // a duel reads as a firefight instead of silent soldiers.
  const botFlashes = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.scale.set(0.5, 0.5, 1);
    sp.visible = false;
    scene.scene.add(sp);
    botFlashes.push(sp);
  }
  scene.scene.add(camera);

  const radarCanvas = $('radar');
  const radarCtx = radarCanvas.getContext('2d');
  let cameraMode = 'fpp';
  let watching = null;
  let shotMode = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('shot') : null;

  // Tracer / impact / explosion meshes, pooled.
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat);
    line.visible = false;
    scene.scene.add(line);
    tracers.push(line);
  }
  // Tracer beams: thin additive boxes stretched muzzle-to-impact. A 1 px
  // line is invisible at 720p — the top entries' tracers read because they
  // are thick bright bolts. One beam per effect, pooled.
  const beamGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beams = [];
  for (let i = 0; i < 12; i++) {
    const beam = new THREE.Mesh(beamGeo, beamMat.clone());
    beam.visible = false;
    scene.scene.add(beam);
    beams.push(beam);
  }
  const smokeSprites = [];
  // Soft radial blob texture so smoke reads as a cloud, not a white box.
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = smokeCanvas.height = 64;
  const sctx = smokeCanvas.getContext('2d');
  const sgrad = sctx?.createRadialGradient?.(32, 32, 2, 32, 32, 32);
  let smokeMap = null;
  if (sgrad && typeof sgrad.addColorStop === 'function') {
    sgrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    sgrad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    sgrad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 64, 64);
    smokeMap = new THREE.CanvasTexture(smokeCanvas);
  }
  const smokeMat = new THREE.SpriteMaterial({
    // Dark slate, not white: against snow and pale walls a white cloud is
    // invisible. A smoke grenade reads as a grey cloud, so the sprite is
    // a mid-dark blue-grey at high opacity.
    color: 0x4a5a65, transparent: true, opacity: 0.85, depthWrite: false,
    ...(smokeMap ? { map: smokeMap } : {}),
  });
  for (let i = 0; i < 8; i++) {
    const sprite = new THREE.Sprite(smokeMat);
    sprite.scale.set(6, 6, 1);
    sprite.visible = false;
    scene.scene.add(sprite);
    smokeSprites.push(sprite);
  }
  // The planted charge: a dark case with a blinking amber light, visible
  // only while s.bomb exists. The HUD alone used to be the only sign.
  const bombCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.28, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.6 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff9a1a, emissiveIntensity: 2 }),
  );
  bombLight.position.y = 0.17;
  bombCase.add(bombLight);
  bombCase.visible = false;
  scene.scene.add(bombCase);

  // Deterministic screenshot staging: ?shot=start|play|end&seed=1 sets the
  // scene up for a capture. The 'start' pose applies immediately (menu
  // backdrop); 'play'/'end' apply once the round goes live, because
  // startRound resets every actor to their spawn.
  // NOTE: the sim overwrites the player's yaw from input.yaw every tick
  // (simulation.js: p.yaw = input.yaw), so staging must set BOTH — setting
  // p.yaw alone is silently undone on the next tick.
  let staged = false;
  // `inp` is the live input object (frame only). At view creation there is
  // no input yet, so the start pose only sets p.yaw/pitch there and the
  // first frame re-applies it with input.
  function stageShot(inp) {
    if (!shotMode || staged) return;
    const p = s.actors[0];
    const aim = (yaw, pitch) => {
      p.yaw = yaw; p.pitch = pitch;
      if (inp) { inp.yaw = yaw; inp.pitch = pitch; }
    };
    if (shotMode === 'start') {
      p.x = -14; p.z = 0; aim(-Math.PI / 2, 0);
      staged = true;
    } else if (shotMode === 'play' && s.phase === 'live') {
      // Mid lane, looking east: the long open sightline down the lane,
      // three VALE soldiers in the open ahead, the site signs and the
      // ridge in frame. The west-facing poses were tried and dropped:
      // Mid's offset baffles chop the westward sightline, so every
      // west-facing still put a baffle face or a cargo crate across the
      // frame a metre from the lens. East, the lane runs open to the
      // sites, and the low western sun lights the soldiers' faces toward
      // the camera instead of rimming them into silhouettes.
      // Mid-match state, like the top entries' fight shots (round 4-7,
      // a rifle bought, money in the thousands) instead of a bare round 1.
      s.round = 4; s.score = [2, 1]; s.timer = 82;
      p.money = 3850; p.w = 2; p.ammo = 25; p.reserve = 90;
      p.grenades = { frag: 1, flash: 1, smoke: 1 };
      p.hp = 88; p.armor = 76;
      p.muzzle = 0.085;
      gunMesh = setWeapon(2);
      p.x = -8; p.z = 0; aim(-1.75, 0);
      const spots = [[-3, -1.2], [-1, 1], [1, -0.8]];
      for (let i = 0; i < 3; i++) {
        const e = s.actors[5 + i];
        e.x = spots[i][0]; e.z = spots[i][1]; e.alive = true;
      }
      // Two kills already happened this round, through the real damage
      // path (feed + radio + money, same as a live kill): the feed is
      // never empty in the shot, and the victims are out of frame.
      const kite = s.actors[1], mica = s.actors[2];
      kite.w = 2; mica.w = 2;
      damage(s, s.actors[8], 999, kite, true);
      damage(s, s.actors[9], 999, mica, false);
      s.gunfire.push({ x: -1, z: 1, t: s.t, team: 1, actor: 5 });
      s.effects.push({ x: p.x, z: p.z, y: 1.5, ex: -3, ez: -1.2, ey: 1.4, life: 5, team: 0, shooter: 0 });
      s.effects.push({ x: -1, z: 1, y: 1.5, ex: p.x, ez: p.z, ey: 1.5, life: 5, team: 1, shooter: 5 });
      s.smokes.push({ x: 3, z: 0, life: 15 });
      staged = true;
    } else if (shotMode === 'end' && s.phase === 'live') {
      // South entry of site A, looking north through the gap: the planted
      // charge in front of the red gondola cabin, GONDOLA HALL signage
      // above, two defenders closing in. The camera stands in the
      // connector just south of the entry (12, -7.5), close enough that
      // the charge reads at a glance — the first pose stood a metre
      // further back and the entry wall filled half the frame while the
      // charge sat small behind a fence post.
      s.round = 4; s.score = [2, 1];
      p.money = 3850; p.w = 2; p.ammo = 25; p.reserve = 90;
      p.grenades = { frag: 1, flash: 1, smoke: 1 };
      gunMesh = setWeapon(2);
      p.x = 12; p.z = -7.5; aim(-0.16, 0);
      s.bomb = { x: 13, z: -10, fuse: 30 };
      // Same two real kills as the fight shot, so the feed reads live
      // here too.
      const kite = s.actors[1], mica = s.actors[2];
      kite.w = 2; mica.w = 2;
      damage(s, s.actors[8], 999, kite, true);
      damage(s, s.actors[9], 999, mica, false);
      // Hold fire while the still is taken: the defenders are metres away
      // with a clear line of sight, and a hit would light the damage
      // vignette across the frame. Reaction delay is ~0.25 s, so a -30 s
      // head start plus a long cooldown keeps every VALE bot quiet.
      // Staging only — this branch never runs without ?shot=end.
      for (const e of s.actors.slice(5)) { e.react = -30; e.cool = 30; }
      // Bright phase for the charge's blinking light, so the amber dot
      // reads in the still.
      if (Math.sin(s.t * 6) <= 0) s.t += Math.PI / 6;
      const guards = [[11, -10.5], [15, -11]];
      for (let i = 0; i < 2; i++) {
        const e = s.actors[5 + i];
        e.x = guards[i][0]; e.z = guards[i][1]; e.alive = true; e.yaw = Math.PI;
      }
      staged = true;
    }
  }
  stageShot();

  function setWeapon(i) {
    if (gunMesh) camera.remove(gunMesh);
    const next = placeGun(weaponModel(i));
    camera.add(next);
    return next;
  }

  // HUD: scoreboard, timer, money, health, armour, ammo, feed, radio.
  // The scoreboard and vitals rebuild only when their text changes, so the
  // DOM is not churned every frame.
  let lastScoreHtml = '', lastVitalsHtml = '', lastAmmoText = '', lastZone = '';
  let lastFeedHtml = '', lastRadioHtml = '', lastBuyKey = '', lastHintVisible = null;
  const zoneOf = (p) => {
    if (Math.hypot(p.x - 13, p.z + 10) < 5) return 'A · GONDOLA HALL';
    if (Math.hypot(p.x - 13, p.z - 11) < 5) return 'B · CABLE YARD';
    if (p.z < -7) return 'A-LONG / NORTH WALK';
    if (p.z > 7) return 'B-LONG / SOUTH RAMP';
    return 'MID / TICKET PLAZA';
  };
  function updateHud() {
    const p = s.actors[0];
    const score = $('score');
    if (score) {
      const pips = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 7 - n));
      const phase = s.phase === 'buy' ? 'BUY' : s.phase === 'live' ? (s.bomb ? 'LIVE · CHARGE' : 'LIVE') : s.phase.toUpperCase();
      const html = `<span class="sc-chip sc-summit">SUMMIT</span> <b>${s.score[0]}</b> <span class="sc-pips">${pips(s.score[0])}</span> — <span class="sc-pips">${pips(s.score[1])}</span> <b>${s.score[1]}</b> <span class="sc-chip sc-vale">VALE</span> · ROUND ${s.round}/12 · ${fmt(s.timer)}s · ${phase}`;
      if (html !== lastScoreHtml) { score.innerHTML = html; lastScoreHtml = html; }
    }
    const vitals = $('vitals');
    if (vitals) {
      const hp = Math.max(0, Math.round(p.hp));
      const html = `<span class="vt-label">HEALTH</span><span class="vt-bar"><i style="width:${hp}%;background:#4dd06a"></i></span><b>${hp}</b> <span class="vt-label">ARMOUR</span><span class="vt-bar"><i style="width:${Math.round(p.armor)}%;background:#5fb7e8"></i></span><b>${Math.round(p.armor)}</b> <span class="vt-money">$${p.money}</span>`;
      if (html !== lastVitalsHtml) { vitals.innerHTML = html; lastVitalsHtml = html; }
    }
    const ammo = $('ammo');
    if (ammo) {
      const text = `${weapons[p.w].name} · ${p.ammo}/${p.reserve}${p.reload > 0 ? ' · RELOADING' : ''} · FRAG ${p.grenades.frag} · SMOKE ${p.grenades.smoke}`;
      if (text !== lastAmmoText) { ammo.textContent = text; lastAmmoText = text; }
    }
    const loc = $('location');
    if (loc) {
      const zone = zoneOf(p);
      if (zone !== lastZone) { loc.textContent = zone; lastZone = zone; }
    }
    const feed = $('feed');
    if (feed) {
      // Rebuilt only when the feed changes: rewriting innerHTML every
      // frame churns the DOM for nothing, same as the radio and the shop.
      const html = s.feed.map((f) => `<div>${f}</div>`).join('');
      if (html !== lastFeedHtml) { feed.innerHTML = html; lastFeedHtml = html; }
    }
    const radio = $('radio');
    if (radio) {
      // Two lines at most: four lines of small callouts crowded the
      // bottom-left of every live screenshot. The log still holds four;
      // the screen shows the two newest.
      const html = s.radio.slice(0, 2).map((r) => `<div>${r}</div>`).join('');
      if (html !== lastRadioHtml) { radio.innerHTML = html; lastRadioHtml = html; }
    }
    const hint = $('hint');
    if (hint) {
      // A control reminder, not a permanent fixture: the first ten
      // seconds of round 1's live phase only. It used to sit on every
      // screenshot, reading as unfinished UI next to the top entries'
      // clean frames; the menu already lists the controls.
      const show = s.phase === 'live' && s.round === 1 && s.t < 25;
      if (show !== lastHintVisible) { hint.style.display = show ? '' : 'none'; lastHintVisible = show; }
    }
    const banner = $('banner');
    if (banner) {
      banner.textContent = s.phase === 'buy' ? `BUY PHASE — ${fmt(s.timer)}s · Press B for REQUISITION`
        : s.phase === 'end' ? `${s.result || ''} — next round in ${fmt(s.timer)}s`
        : s.bomb ? `CHARGE PLANTED — ${fmt(s.bomb.fuse)}s`
        : `ROUND ${s.round} · ${fmt(s.timer)}s`;
    }
    const objective = $('objective');
    if (objective) objective.textContent = s.bomb ? 'DEFEND THE CHARGE' : 'PLANT AT A OR B';
    const cross = $('cross');
    if (cross) cross.style.color = prefs.crosshair;
    const hit = $('hitmarker');
    if (hit) hit.style.opacity = s.hit > 0 ? '1' : '0';
    const vig = $('damageVignette');
    if (vig) vig.style.opacity = p.hurt > 0 ? String(Math.min(0.8, p.hurt * 2)) : '0';
    const flash = $('flash');
    if (flash) flash.style.opacity = s.flash > 0 ? String(Math.min(1, s.flash)) : '0';
    const scope = $('scope');
    if (scope) scope.style.opacity = p.w === 4 && inputAim ? '1' : '0';
  }
  let inputAim = false;

  function updateRadar() {
    if (!radarCanvas) return;
    const p = s.actors[0];
    const px = radarCanvas.width / 2;
    drawRadar(radarCtx, s, p, px, px, px, prefs.radarUp ? 0 : p.yaw);
  }

  // Buy menu: five weapon columns with prices/stats/owned markers, plus gear.
  // Rebuilt only when something in it changes (money, timer, loadout):
  // rewriting the shop's innerHTML every frame churned the DOM for
  // nothing while the player was just standing in the buy phase.
  function updateBuy() {
    const shop = $('shop');
    if (!shop) return;
    const p = s.actors[0];
    const visible = s.phase === 'buy';
    shop.classList.toggle('hidden', !visible);
    if (!visible) return;
    const key = [p.money, fmt(s.timer), p.w, p.ammo, p.grenades.frag,
      p.grenades.smoke, p.grenades.flash, p.armor, p.helmet, p.kit].join('|');
    if (key === lastBuyKey) return;
    lastBuyKey = key;
    shop.innerHTML = `<div class="shop-title">REQUISITION — $${p.money} · ${fmt(s.timer)}s left</div>` +
      weapons.map((w, i) => `
        <div class="shop-col ${p.w === i ? 'owned' : ''}" data-weapon="${i}">
          <div class="shop-name">${w.name}</div>
          <div class="shop-price">$${w.price}</div>
          <div class="shop-stat">DMG ${w.dmg} · RPM ${w.rpm} · MAG ${w.mag}</div>
          <button data-buy="${i}">${p.w === i ? 'EQUIPPED' : 'BUY'}</button>
        </div>`).join('') +
      `<div class="shop-gear">
        <button data-buy="frag">FRAG $300</button>
        <button data-buy="smoke">SMOKE $300</button>
        <button data-buy="flash">FLASH $200</button>
        <button data-buy="vest">VEST $650</button>
        <button data-buy="helmet">HELMET $1000</button>
        <button data-buy="kit">KIT $400</button>
      </div>`;
    shop.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => viewApi.onBuy(b.dataset.buy);
    });
  }

  // One frame: advance the camera + weapon feel, draw actors and effects,
  // refresh the HUD, render.
  function frame(input, dt) {
    stageShot(input);
    const p = s.actors[0];
    inputAim = input.aim;
    const feel = motion(p, input, dt);
    preloadActors(s.actors);
    for (const a of s.actors) {
      const g = animatedSoldier(a, s.t, dt);
      if (g && !g.parent) scene.scene.add(g);
      // First person hides the player's own soldier: its held gun hangs
      // across the bottom of the screen as a black bar (the view-model gun
      // is the separate weaponModel on the camera). A dead player's body
      // stays visible for the spectator view, and TPP keeps the soldier.
      if (g && a.id === 0 && p.alive && cameraMode === 'fpp') g.visible = false;
    }
    // Camera.
    if (!p.alive) {
      if (!watching || !watching.alive) watching = observerActor(s, p, watching);
      const target = watching || p;
      camera.position.set(target.x, eyeHeight(target) + 0.6, target.z);
      camera.rotation.set(target.pitch || 0, target.yaw || 0, 0, 'YXZ');
      camera.fov = spectatorFov(watching);
    } else if (cameraMode === 'tpp') {
      const back = 3.2;
      camera.position.set(
        p.x + Math.sin(p.yaw) * back, eyeHeight(p) + 1.1,
        p.z + Math.cos(p.yaw) * back);
      camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      camera.fov = prefs.fov;
    } else {
      camera.position.set(p.x, eyeHeight(p) + feel.bob + feel.drop, p.z);
      camera.rotation.set(
        p.pitch + feel.kick * 0.02, p.yaw, feel.roll, 'YXZ');
      camera.fov = prefs.fov - feel.ads * 8;
    }
    camera.updateProjectionMatrix();
    // Weapon feel: ADS zoom, recoil kick, reload sway.
    gunMesh.position.set(
      0.34 - feel.ads * 0.16, -0.3 + feel.ads * 0.06 - feel.reload * 0.08, -0.55);
    gunMesh.rotation.x = feel.kick * 0.06 + feel.reload * 0.4;
    gunMesh.visible = p.alive && cameraMode === 'fpp';
    // Muzzle flash follows the barrel tip of the current weapon (muzzle
    // offsets are per-weapon barrel lengths, scaled with the view-model).
    const muzzleReach = [0.25, 0.5, 0.62, 0.6, 0.8][p.w] || 0.5;
    muzzleFlash.position.set(0.34, -0.28, -0.55 - muzzleReach);
    muzzleFlash.visible = p.alive && cameraMode === 'fpp' && (p.muzzle || 0) > 0;
    // Tracers.
    let ti = 0;
    for (const e of s.effects) {
      if (ti >= tracers.length) break;
      if (e.ex === undefined) continue;
      const line = tracers[ti++];
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, e.x, e.y, e.z);
      pos.setXYZ(1, e.ex, e.ey, e.ez);
      pos.needsUpdate = true;
      line.visible = true;
      line.material.opacity = Math.max(0, e.life / 0.12) * 0.9;
    }
    for (; ti < tracers.length; ti++) tracers[ti].visible = false;
    // Beams for the same effects: stretched from the shot's origin to its
    // endpoint, fading with the effect's remaining life. Both ends are
    // kept at least 1.2 m from the camera: a beam that starts or ends at
    // the lens blows out into a giant triangle at the near plane.
    let bi = 0;
    for (const e of s.effects) {
      if (bi >= beams.length) break;
      if (e.ex === undefined) continue;
      const beam = beams[bi++];
      let sx = e.x, sy = e.y, sz = e.z, ex = e.ex, ey = e.ey, ez = e.ez;
      let dx = ex - sx, dy = ey - sy, dz = ez - sz;
      let len = Math.hypot(dx, dy, dz);
      if (len < 0.1) { beam.visible = false; continue; }
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const cam = camera.position;
      const dStart = Math.hypot(sx - cam.x, sy - cam.y, sz - cam.z);
      if (dStart < 1.2) {
        const push = 1.2 - dStart;
        sx += ux * push; sy += uy * push; sz += uz * push;
      }
      const dEnd = Math.hypot(ex - cam.x, ey - cam.y, ez - cam.z);
      if (dEnd < 1.2) {
        const pull = 1.2 - dEnd;
        ex -= ux * pull; ey -= uy * pull; ez -= uz * pull;
      }
      dx = ex - sx; dy = ey - sy; dz = ez - sz;
      len = Math.hypot(dx, dy, dz);
      if (len < 0.5) { beam.visible = false; continue; }
      beam.position.set((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2);
      beam.lookAt(ex, ey, ez);
      beam.scale.set(1, 1, len);
      beam.material.opacity = Math.max(0, Math.min(1, e.life / 0.12)) * 0.85;
      beam.visible = true;
    }
    for (; bi < beams.length; bi++) beams[bi].visible = false;
    // Bot muzzle flashes at recent gunfire spots.
    let fi = 0;
    for (const shot of (s.gunfire || []).slice(-4)) {
      if (fi >= botFlashes.length) break;
      const age = s.t - shot.t;
      if (age > 0.15) continue;
      const sp = botFlashes[fi++];
      const shooter = s.actors[shot.actor];
      sp.position.set(shot.x, eyeHeight(shooter || s.actors[0]), shot.z);
      sp.material.opacity = 1 - age / 0.15;
      sp.visible = true;
    }
    for (; fi < botFlashes.length; fi++) botFlashes[fi].visible = false;
    // Smoke clouds.
    let si = 0;
    for (const c of s.smokes) {
      if (si >= smokeSprites.length) break;
      const sprite = smokeSprites[si++];
      sprite.position.set(c.x, 1.2, c.z);
      sprite.visible = true;
      sprite.material.opacity = Math.min(0.85, c.life / 15 * 0.85);
    }
    for (; si < smokeSprites.length; si++) smokeSprites[si].visible = false;
    // Planted charge model + blinking light.
    if (s.bomb) {
      bombCase.visible = true;
      bombCase.position.set(s.bomb.x, 0.14, s.bomb.z);
      bombLight.material.emissiveIntensity = (Math.sin(s.t * 6) > 0) ? 2.5 : 0.3;
    } else {
      bombCase.visible = false;
    }

    scene.update(dt, prefs.snow);
    updateHud();
    updateRadar();
    updateBuy();
    renderer.render(scene.scene, camera);
  }

  const viewApi = {
    frame,
    canvas: renderer.domElement,
    setWeapon(i) { gunMesh = setWeapon(i); },
    cycleCamera() {
      cameraMode = cameraMode === 'fpp' ? 'tpp' : cameraMode === 'tpp' ? 'spec' : 'fpp';
      if (cameraMode === 'spec') watching = observerActor(s, s.actors[0]);
      return cameraMode;
    },
    nextSpectator() {
      watching = nextObserver(s, s.actors[0], watching);
      return watching;
    },
    onBuy: () => {},
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    },
  };
  addEventListener('resize', viewApi.resize);
  return viewApi;
}
