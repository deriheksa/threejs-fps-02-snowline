// Input: the joystick, touch aim-drag and fire pads work at the same time
// with independent fingers; blur clears everything; a disabled input ignores
// all events; a jump tap queues until the next step; crouch toggles on tap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controls } from '../game/controls.js';

class Element extends EventTarget {
  constructor(dataset = {}) {
    super();
    this.dataset = dataset;
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.tagName = 'DIV';
  }
  setAttribute(name, value) { this[name] = value; }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

const send = (el, type, props = {}) => {
  const e = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(e, key, { value });
  }
  el.dispatchEvent(e);
};

function setup() {
  const win = new Element();
  const canvas = new Element();
  const pad = new Element();
  const knob = new Element();
  const fire = new Element({ hold: 'fire' });
  const use = new Element({ hold: 'use' });
  const jump = new Element({ hold: 'jump' });
  const crouch = new Element({ hold: 'crouch', toggle: 'crouch' });
  globalThis.addEventListener = win.addEventListener.bind(win);
  const doc = new Element();
  doc.querySelector = (s) => s === '#stick' ? pad : knob;
  doc.querySelectorAll = (s) => s === '[data-toggle]' ? [crouch] : [fire, use, jump, crouch];
  globalThis.document = doc;
  globalThis.matchMedia = () => ({ matches: true });
  const input = controls(canvas);
  input.enabled = true;
  return { input, win, canvas, pad, fire, use, jump, crouch };
}

test('mobile: joystick, aiming and firing work simultaneously with independent fingers', () => {
  const { input, pad, canvas, fire, win } = setup();
  send(pad, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 0 });
  send(canvas, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 });
  send(fire, 'pointerdown', { pointerId: 3, pointerType: 'touch' });
  const yaw = input.yaw;
  send(canvas, 'pointermove', { pointerId: 2, clientX: 330, clientY: 120 });
  assert.ok(input.moveX > 0 && input.moveZ < 0);
  assert.ok(input.yaw < yaw);
  assert.equal(input.fire, true);
  send(canvas, 'pointerup', { pointerId: 2, pointerType: 'touch' });
  assert.equal(input.fire, true);
  send(fire, 'pointerup', { pointerId: 3, pointerType: 'touch' });
  assert.equal(input.fire, false);
  assert.ok(input.moveX > 0);
  send(pad, 'pointercancel', { pointerId: 1 });
  assert.equal(input.moveX, 0);
});

test('controls: blur clears held keys, weapon and joystick to prevent stuck movement', () => {
  const { input, win, pad, fire } = setup();
  send(win, 'keydown', { code: 'KeyW', repeat: false });
  send(pad, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 50 });
  send(fire, 'pointerdown', { pointerId: 3 });
  assert.ok(input.forward && input.fire);
  send(win, 'blur');
  assert.equal(input.forward, false);
  assert.equal(input.fire, false);
  assert.equal(input.moveX, 0);
});

test('controls: disabled menu controls ignore pointer and keyboard input', () => {
  const { input, win, fire, pad } = setup();
  input.enabled = false;
  send(fire, 'pointerdown', { pointerId: 2 });
  send(pad, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 0 });
  send(win, 'keydown', { code: 'KeyW' });
  assert.ok(!input.fire && !input.forward);
  assert.equal(input.moveX, 0);
});

test('mobile: jump tap is queued even if released before the next simulation step', () => {
  const { input, jump } = setup();
  send(jump, 'pointerdown', { pointerId: 4 });
  send(jump, 'pointerup', { pointerId: 4 });
  assert.equal(input.jump, false);
  assert.equal(input.jumpPressed, true);
});

test('mobile: crouch toggles on tap and stands on second tap', () => {
  const { input, crouch } = setup();
  send(crouch, 'pointerdown', { pointerId: 4 });
  send(crouch, 'pointerup', { pointerId: 4 });
  assert.equal(input.crouch, true);
  send(crouch, 'pointerdown', { pointerId: 5 });
  send(crouch, 'pointerup', { pointerId: 5 });
  assert.equal(input.crouch, false);
});
