// SNOWLINE — keyboard, mouse and touch input.
// Mouse look works under pointer lock; touch aim drags on the canvas; the
// left joystick (#stick) moves; pads with data-hold act while pressed and
// pads with data-toggle flip on tap. A queued jump (jumpPressed) survives
// until the next simulation step even if the key is released first.
export function controls(canvas, onAction = () => {}) {
  const input = {
    yaw: 0, pitch: 0, fire: false, reload: false, crouch: false,
    forward: false, back: false, left: false, right: false,
    sprint: false, jump: false, use: false, aim: false,
    mouseX: 0, mouseY: 0, moveX: 0, moveZ: 0,
    jumpPressed: false, enabled: true,
  };
  const keys = {};
  const touch = {};
  let locked = false;
  let aimPointer = null;
  let stickPointer = null;
  let toggleCrouch = false;
  const stickEl = typeof document !== 'undefined' ? document.querySelector?.('#stick') : null;

  function refresh() {
    input.forward = !!(keys.KeyW || touch.up);
    input.back = !!(keys.KeyS || touch.down);
    input.left = !!(keys.KeyA || touch.left);
    input.right = !!(keys.KeyD || touch.right);
    input.sprint = !!(keys.ShiftLeft || touch.sprint);
    input.aim = !!(keys.Mouse2 || touch.aim);
    input.use = !!(keys.KeyE || touch.use);
    input.jump = !!(keys.Space || touch.jump);
    input.crouch = !!(keys.KeyC || touch.crouch || toggleCrouch);
  }

  function clearAll() {
    for (const k of Object.keys(keys)) keys[k] = false;
    for (const k of Object.keys(touch)) touch[k] = false;
    toggleCrouch = false;
    input.fire = false;
    input.moveX = 0;
    input.moveZ = 0;
    input.jumpPressed = false;
    aimPointer = null;
    stickPointer = null;
    refresh();
  }

  function keyDown(e) {
    if (!input.enabled) return;
    keys[e.code] = true;
    if (e.code === 'Space' && !e.repeat) input.jumpPressed = true;
    if (e.code === 'KeyF') onAction('console');
    if (e.code === 'KeyM') onAction('sound');
    if (e.code === 'KeyR' && !e.repeat) onAction('reload');
    if (e.code === 'KeyC') onAction('cam');
    if (e.code === 'KeyT') onAction('cam');
    if (e.code === 'Digit1') onAction('weapon:0');
    if (e.code === 'Digit2') onAction('weapon:1');
    if (e.code === 'Digit3') onAction('weapon:2');
    if (e.code === 'Digit4') onAction('weapon:3');
    if (e.code === 'Digit5') onAction('weapon:4');
    if (e.code === 'Digit6') onAction('grenade:frag');
    if (e.code === 'Digit7') onAction('grenade:smoke');
    if (e.code === 'Digit8') onAction('grenade:flash');
    if (e.code === 'KeyG') onAction('grenade:frag');
    if (e.code === 'KeyQ') onAction('grenade:flash');
    if (e.code === 'KeyV') onAction('grenade:smoke');
    if (e.code === 'KeyP' || e.code === 'Escape') onAction('pause');
    if (e.code === 'Enter') onAction('enter');
    if (e.code === 'Tab') onAction('buy');
    if (e.code === 'KeyB') onAction('buy');
    refresh();
  }
  function keyUp(e) {
    keys[e.code] = false;
    refresh();
  }
  function mouseMove(e) {
    if (!input.enabled || !locked) return;
    input.yaw += (e.movementX || 0) * 0.0025;
    input.pitch = Math.max(-1.5, Math.min(1.5, input.pitch - (e.movementY || 0) * 0.0025));
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  }
  function mouseDown(e) {
    if (!input.enabled) return;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) keys.Mouse2 = true;
    refresh();
  }
  function mouseUp(e) {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) keys.Mouse2 = false;
    refresh();
  }
  function lockChange() {
    locked = typeof document !== 'undefined' && document.pointerLockElement != null;
  }

  // Pointer handlers: canvas aim-drag (touch) / fire (mouse), joystick,
  // and the hold/toggle pads.
  function onPointerDown(e) {
    if (!input.enabled) return;
    const el = e.currentTarget || e.target;
    if (el === canvas) {
      if (e.pointerType === 'touch') {
        aimPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        input.fire = true;
      }
      return;
    }
    if (el === stickEl) {
      stickPointer = e.pointerId;
      updateStick(e);
      return;
    }
    const action = el?.dataset?.hold || el?.dataset?.toggle;
    if (!action) return;
    if (el.dataset.toggle !== undefined) {
      if (action === 'crouch') toggleCrouch = !toggleCrouch;
      refresh();
      return;
    }
    if (action === 'jump') {
      input.jumpPressed = true;
      return;
    }
    if (action === 'reload') { onAction('reload'); return; }
    if (action === 'grenade') { onAction('grenade:frag'); return; }
    if (action === 'cam') { onAction('cam'); return; }
    if (action === 'pause') { onAction('pause'); return; }
    touch[action] = true;
    if (action === 'fire') input.fire = true;
    refresh();
  }
  function onPointerMove(e) {
    if (!input.enabled) return;
    if (aimPointer && e.pointerId === aimPointer.id) {
      input.yaw -= (e.clientX - aimPointer.x) * 0.003;
      input.pitch = Math.max(-1.5, Math.min(1.5,
        input.pitch - (e.clientY - aimPointer.y) * 0.003));
      aimPointer.x = e.clientX;
      aimPointer.y = e.clientY;
      return;
    }
    if (stickPointer !== null && e.pointerId === stickPointer) updateStick(e);
  }
  function onPointerUp(e) {
    if (e.pointerId === aimPointer?.id) { aimPointer = null; return; }
    if (e.pointerId === stickPointer) {
      stickPointer = null;
      input.moveX = 0;
      input.moveZ = 0;
      return;
    }
    const el = e.currentTarget || e.target;
    const action = el?.dataset?.hold;
    if (!action || el.dataset.toggle !== undefined) return;
    touch[action] = false;
    if (action === 'fire') input.fire = false;
    refresh();
  }
  function updateStick(e) {
    const rect = stickEl?.getBoundingClientRect?.() || { left: 0, top: 0, width: 100, height: 100 };
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    input.moveX = Math.max(-1, Math.min(1, dx / 34));
    input.moveZ = Math.max(-1, Math.min(1, dy / 34));
  }

  // Wire everything up.
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.addEventListener?.('keydown', keyDown);
  root.addEventListener?.('keyup', keyUp);
  root.addEventListener?.('mousemove', mouseMove);
  root.addEventListener?.('mousedown', mouseDown);
  root.addEventListener?.('mouseup', mouseUp);
  root.addEventListener?.('blur', clearAll);
  if (typeof document !== 'undefined') {
    document.addEventListener?.('pointerlockchange', lockChange);
    document.addEventListener?.('contextmenu', (e) => e.preventDefault());
  }
  canvas?.addEventListener?.('pointerdown', onPointerDown);
  canvas?.addEventListener?.('pointermove', onPointerMove);
  canvas?.addEventListener?.('pointerup', onPointerUp);
  canvas?.addEventListener?.('pointercancel', onPointerUp);
  if (typeof document !== 'undefined') {
    const stick = stickEl;
    stick?.addEventListener?.('pointerdown', onPointerDown);
    stick?.addEventListener?.('pointermove', onPointerMove);
    stick?.addEventListener?.('pointerup', onPointerUp);
    stick?.addEventListener?.('pointercancel', onPointerUp);
    for (const pad of document.querySelectorAll?.('[data-hold]') || []) {
      pad.addEventListener?.('pointerdown', onPointerDown);
      pad.addEventListener?.('pointerup', onPointerUp);
      pad.addEventListener?.('pointercancel', onPointerUp);
    }
    for (const pad of document.querySelectorAll?.('[data-toggle]') || []) {
      pad.addEventListener?.('pointerdown', onPointerDown);
      pad.addEventListener?.('pointerup', onPointerUp);
      pad.addEventListener?.('pointercancel', onPointerUp);
    }
  }
  return input;
}
