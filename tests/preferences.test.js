// Preferences: malformed saves cannot produce extreme aim, audio or FOV,
// and choices persist across sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, defaults, loadPreferences, savePreferences } from '../game/preferences.js';

test('preferences: malformed saved values cannot produce extreme aim, audio or FOV', () => {
  const p = normalizePreferences({
    sensitivity: 999, volume: -1, fov: 'oops', invert: 'yes', crosshair: 'red', snow: 'false',
  });
  assert.deepEqual(p, {
    sensitivity: 3, volume: 0, fov: 74, invert: false,
    crosshair: '#9fe8ff', snow: true, radarUp: false, showHints: true,
  });
  assert.deepEqual(normalizePreferences(), defaults);
});

test('preferences: persist user choices and recover from corrupt or unavailable storage', () => {
  let value = '';
  globalThis.localStorage = {
    getItem: () => value,
    setItem: (k, v) => { value = v; },
  };
  savePreferences({ sensitivity: 1.7, volume: 0.3, fov: 85, invert: true, crosshair: 'amber', snow: false });
  assert.equal(loadPreferences().fov, 85);
  assert.equal(loadPreferences().snow, false);
  value = '{bad json';
  assert.deepEqual(loadPreferences(), defaults);
  globalThis.localStorage = {
    getItem() { throw Error('blocked'); },
    setItem() { throw Error('blocked'); },
  };
  assert.doesNotThrow(() => savePreferences(defaults));
  assert.deepEqual(loadPreferences(), defaults);
  delete globalThis.localStorage;
});
