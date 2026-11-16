// SNOWLINE — bootstrap: menus, the fixed-step game loop, actions.
// The loop runs the simulation at 60 Hz and renders every frame. All menu
// and shop clicks go through the action handler below; the simulation
// modules never touch the DOM.
import { createState, startRound, buy, weapons } from './state.js';
import { step, interact } from './simulation.js';
import { fire, reload, grenade } from './combat.js';
import { view } from './view.js';
import { controls } from './controls.js';
import { loadPreferences, savePreferences } from './preferences.js';
import { unlockAudio, setVolume, sound } from './audio.js';
import { fieldConsole } from './console.js';

const prefs = loadPreferences();
const s = createState(1337);
const v = view(s, prefs);
const input = controls(v.canvas, handleAction);
const fc = fieldConsole(s, prefs, handleBuy, startGame, () => fc.close());

let running = false;
let last = performance.now();
let accumulator = 0;

// --- menus ---------------------------------------------------------------
const menu = document.getElementById('menu');
const pauseMenu = document.getElementById('pause');
const startBtn = document.getElementById('start');
const resumeBtn = document.getElementById('resume');
const quitBtn = document.getElementById('quit');
const diffBtns = document.querySelectorAll('[data-diff]');

let difficulty = 'normal';
diffBtns.forEach((b) => {
  b.onclick = () => {
    difficulty = b.dataset.diff;
    diffBtns.forEach((x) => x.classList.toggle('active', x === b));
  };
});

function startGame() {
  unlockAudio();
  setVolume(prefs.volume);
  menu.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  fc.close();
  if (s.phase === 'menu') startRound(s);
  s.paused = false;
  running = true;
  document.body.requestPointerLock?.();
}

if (startBtn) startBtn.onclick = startGame;
if (resumeBtn) resumeBtn.onclick = () => {
  s.paused = false;
  pauseMenu.classList.add('hidden');
  running = true;
  document.body.requestPointerLock?.();
};
if (quitBtn) quitBtn.onclick = () => {
  s.paused = true;
  running = false;
  pauseMenu.classList.add('hidden');
  menu.classList.remove('hidden');
  document.exitPointerLock?.();
};

// --- actions -------------------------------------------------------------
function handleBuy(type) {
  const p = s.actors[0];
  const index = Number(type);
  const bought = buy(s, p, Number.isNaN(index) ? type : index);
  if (bought) {
    sound('click', 0.6);
    if (!Number.isNaN(index)) v.setWeapon(index);
  }
  return bought;
}

function handleAction(action) {
  const p = s.actors[0];
  if (action === 'enter') { if (s.phase === 'menu') startGame(); return; }
  if (action === 'console') { fc.isOpen() ? fc.close() : fc.open(); return; }
  if (action === 'sound') { prefs.volume = prefs.volume > 0 ? 0 : 0.5; setVolume(prefs.volume); savePreferences(prefs); return; }
  if (action === 'pause') {
    if (s.phase === 'menu') return;
    s.paused = !s.paused;
    pauseMenu.classList.toggle('hidden', !s.paused);
    running = !s.paused;
    if (s.paused) document.exitPointerLock?.();
    else document.body.requestPointerLock?.();
    return;
  }
  if (!running || s.paused) return;
  if (action === 'reload') { if (reload(p)) sound('reload'); return; }
  if (action === 'cam') { v.cycleCamera(); return; }
  if (action === 'buy') { fc.isOpen() ? fc.close() : fc.open(); return; }
  if (action.startsWith('weapon:')) {
    const arg = action.slice(7);
    let next = arg === 'next' ? (p.w + 1) % weapons.length
      : arg === 'prev' ? (p.w + weapons.length - 1) % weapons.length
      : Number(arg);
    if (Number.isFinite(next) && next >= 0 && next < weapons.length && s.phase === 'buy') {
      p.w = next;
      p.ammo = weapons[next].mag;
      p.reserve = p.ammo * 4;
      v.setWeapon(next);
    }
    return;
  }
  if (action.startsWith('grenade:')) { grenade(s, p, action.slice(8), input.yaw); }
}
v.onBuy = handleBuy;

// --- main loop -----------------------------------------------------------
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!running || s.paused) { v.frame(input, 0); return; }
  accumulator += dt;
  while (accumulator >= 1 / 60) {
    accumulator -= 1 / 60;
    const p = s.actors[0];
    if (input.fire && p.alive && s.phase === 'live') {
      const moving = Math.hypot(p.vx || 0, p.vz || 0) > 0.5;
      if (fire(s, p, input.yaw, input.pitch, moving, input.aim)) sound('shot', 0.8, 1 + Math.random() * 0.1);
    }
    step(s, input);
    if (p.alive && s.phase === 'live') {
      const speed = Math.hypot(p.vx || 0, p.vz || 0);
      if (speed > 1 && p.grounded) sound('step', 0.15);
    }
    if (s.phase === 'over') {
      running = false;
      const end = document.getElementById('end');
      if (end) {
        end.classList.remove('hidden');
        end.querySelector('.end-title').textContent =
          s.score[0] > s.score[1] ? 'SUMMIT WINS THE MATCH' : 'VALE WINS THE MATCH';
        end.querySelector('.end-score').textContent = `${s.score[0]} — ${s.score[1]}`;
      }
    }
  }
  v.frame(input, dt);
}
requestAnimationFrame(loop);

// Expose the state for the test harness and the screenshot hook.
window.__snowline = { s, prefs, input, startGame };
