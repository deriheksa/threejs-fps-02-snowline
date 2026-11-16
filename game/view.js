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

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.max(0, Math.ceil(n));

export function view(s, prefs) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = world();
  const camera = new THREE.PerspectiveCamera(prefs.fov, innerWidth / innerHeight, 0.05, 220);
  // A small warm fill light rides with the camera so the view-model gun and
  // nearby props are never pitch black.
  const camLight = new THREE.PointLight(0xfff2dd, 0.9, 3, 1.5);
  camera.add(camLight);
  const motion = viewMotion();
  let gunMesh = null;
  camera.add(gunMesh = weaponModel(0));
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
    color: 0xcfd8dc, transparent: true, opacity: 0.55, depthWrite: false,
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
      // A-long, looking east toward site A: a clean open sightline (the Mid
      // baffles block the equivalent Mid shot), enemies in the open ahead.
      p.x = -6; p.z = -11; aim(-Math.PI / 2, 0);
      const spots = [[0, -11], [2, -10], [4, -12]];
      for (let i = 0; i < 3; i++) {
        const e = s.actors[5 + i];
        e.x = spots[i][0]; e.z = spots[i][1]; e.alive = true;
      }
      s.effects.push({ x: p.x, z: p.z, y: 1.6, ex: 0, ez: -11, ey: 1.5, life: 5, team: 0, shooter: 0 });
      s.smokes.push({ x: 2, z: -11.5, life: 15 });
      staged = true;
    } else if (shotMode === 'end' && s.phase === 'live') {
      // Outside site A, looking in through the west entry: the planted
      // charge, the red gondola cabin and the site signage all in frame
      // (standing inside puts the camera under the hall canopy).
      p.x = 6; p.z = -12; aim(-Math.PI / 2, 0);
      s.bomb = { x: 13, z: -10, fuse: 30 };
      staged = true;
    }
  }
  stageShot();

  function setWeapon(i) {
    if (gunMesh) camera.remove(gunMesh);
    const next = weaponModel(i);
    next.position.set(0.28, -0.26, -0.5);
    camera.add(next);
    return next;
  }

  // HUD: scoreboard, timer, money, health, armour, ammo, feed, radio.
  function updateHud() {
    const p = s.actors[0];
    const score = $('score');
    if (score) score.textContent = `SUMMIT ${s.score[0]} — ${s.score[1]} VALE · ROUND ${s.round}/12 · ${fmt(s.timer)}s`;
    const vitals = $('vitals');
    if (vitals) vitals.textContent = `HP ${Math.max(0, Math.round(p.hp))} · ARM ${Math.round(p.armor)} · $ ${p.money}`;
    const ammo = $('ammo');
    if (ammo) ammo.textContent = `${weapons[p.w].name} · ${p.ammo}/${p.reserve}${p.reload > 0 ? ' · RELOADING' : ''}`;
    const feed = $('feed');
    if (feed) feed.innerHTML = s.feed.map((f) => `<div>${f}</div>`).join('');
    const radio = $('radio');
    if (radio) radio.innerHTML = s.radio.map((r) => `<div>${r}</div>`).join('');
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
  function updateBuy() {
    const shop = $('shop');
    if (!shop) return;
    const p = s.actors[0];
    const visible = s.phase === 'buy';
    shop.classList.toggle('hidden', !visible);
    if (!visible) return;
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
      0.28 - feel.ads * 0.16, -0.26 + feel.ads * 0.06 - feel.reload * 0.08, -0.5);
    gunMesh.rotation.x = feel.kick * 0.06 + feel.reload * 0.4;
    gunMesh.visible = p.alive && cameraMode === 'fpp';
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
    // Smoke clouds.
    let si = 0;
    for (const c of s.smokes) {
      if (si >= smokeSprites.length) break;
      const sprite = smokeSprites[si++];
      sprite.position.set(c.x, 1.2, c.z);
      sprite.visible = true;
      sprite.material.opacity = Math.min(0.55, c.life / 15 * 0.55);
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
