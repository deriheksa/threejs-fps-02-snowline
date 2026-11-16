// SNOWLINE — player preferences, saved to localStorage under one key.
// Every setting is validated on load so a stale or edited save can never
// break the game.
export const defaults = {
  sensitivity: 1,
  fov: 74,
  crosshair: '#9fe8ff',
  volume: 0.5,
  snow: true,
  radarUp: false,
  invert: false,
  showHints: true,
};

const KEY = 'snowline-preferences-v1';

export function normalizePreferences(input) {
  const p = { ...defaults };
  if (!input || typeof input !== 'object') return p;
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  p.sensitivity = num(input.sensitivity, 0.2, 3, defaults.sensitivity);
  p.fov = num(input.fov, 60, 100, defaults.fov);
  p.volume = num(input.volume, 0, 1, defaults.volume);
  if (typeof input.crosshair === 'string' && /^#[0-9a-f]{6}$/i.test(input.crosshair)) {
    p.crosshair = input.crosshair;
  }
  p.snow = input.snow !== false;
  p.radarUp = input.radarUp === true;
  p.invert = input.invert === true;
  p.showHints = input.showHints !== false;
  return p;
}

export function loadPreferences() {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizePreferences(prefs)));
  } catch { /* storage unavailable (private mode, quota) — settings just don't persist */ }
}
