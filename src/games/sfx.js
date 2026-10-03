// Tiny synthesized sound effects, so the games need no audio files.
let ctx = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.4, cutoff = 1200) {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  unlock: () => ac(),
  tick: () => tone(1400, 0.04, 'square', 0.05),
  beep: () => tone(880, 0.12, 'square', 0.07),
  go: () => tone(660, 0.25, 'sawtooth', 0.09, 1320),
  bang: () => {
    noise(0.35, 0.6, 3000);
    tone(180, 0.2, 'square', 0.08, 60);
  },
  boom: () => {
    noise(1.2, 0.9, 700);
    tone(90, 0.9, 'sine', 0.35, 30);
  },
  ding: () => {
    tone(988, 0.25, 'sine', 0.12);
    tone(1319, 0.4, 'sine', 0.12, null, 0.12);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, null, i * 0.1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, null, i * 0.14)),
  shutter: () => {
    noise(0.08, 0.5, 5000);
    tone(2000, 0.05, 'square', 0.04, null, 0.06);
  },
  whoosh: () => tone(300, 0.25, 'sawtooth', 0.05, 1200),
};
