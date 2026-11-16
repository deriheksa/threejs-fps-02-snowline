// SNOWLINE — procedural sound. All effects are synthesized with WebAudio:
// filtered noise for shots and impacts, short envelopes for clicks and
// footsteps. No audio files are shipped.
let ctx = null, master = null, enabled = true;
let lastStep = 0;

// Create the audio context on the first user gesture; browsers block audio
// until then.
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// Turn all sound effects on or off.
export function setVolume(v) {
  enabled = v !== false;
  if (master) master.gain.value = enabled ? 0.5 : 0;
}

// Synthesize one effect. volume is the gain; pitch shapes the filter.
// type: 'shot' | 'reload' | 'hit' | 'step' | 'explosion' | 'click'.
export function sound(type, volume = 1, pitch = 1) {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;
  if (type === 'step') {
    if (now - lastStep < 0.06) return;
    lastStep = now;
  }
  const duration = type === 'shot' ? 0.09
    : type === 'reload' ? 0.15 : type === 'hit' ? 0.1
    : type === 'step' ? 0.05 : type === 'explosion' ? 0.9 : 0.03;
  const buffer = ctx.createBuffer(1, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * volume;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = (type === 'shot' ? 1200 : type === 'explosion' ? 220
    : type === 'hit' ? 2200 : type === 'step' ? 400 : 1000) * pitch;
  filter.Q.value = type === 'shot' ? 1.5 : type === 'explosion' ? 0.5 : 2;
  const gain = ctx.createGain();
  gain.gain.value = type === 'explosion' ? 0.9 : type === 'shot' ? 0.55 : 0.25;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  noise.start();
  noise.stop(now + duration);
}
