// Tracks are closed centre-lines. Cars stay "on road" within width/2 of the line.

const TAU = Math.PI * 2;

function param(fn, count, t0 = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) pts.push(fn(t0 + (i / count) * TAU));
  return pts;
}

function catmull(ctrl, perSeg = 16) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

// Even spacing so physics and progress behave the same everywhere on the track.
function resample(pts, spacing = 26) {
  const n = pts.length;
  let total = 0;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(len);
    total += len;
  }
  const count = Math.max(24, Math.round(total / spacing));
  const step = total / count;
  const out = [];
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const d = k * step;
    while (segStart + segs[seg] < d) {
      segStart += segs[seg];
      seg = (seg + 1) % n;
    }
    const t = segs[seg] ? (d - segStart) / segs[seg] : 0;
    const a = pts[seg];
    const b = pts[(seg + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(def) {
  const pts = resample(def.raw);
  const n = pts.length;
  const segLen = [];
  const cum = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(L);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(len);
    L += len;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = def.width * 2.5;
  const bounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  const track = { ...def, pts, segLen, cum, length: L, bounds };

  const rnd = mulberry(def.seed);
  const decos = [];
  for (let tries = 0; tries < 900 && decos.length < 70; tries++) {
    const x = bounds.minX + rnd() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + rnd() * (bounds.maxY - bounds.minY);
    if (nearest(track, x, y).d > def.width * 0.85) {
      decos.push({ x, y, e: def.decos[Math.floor(rnd() * def.decos.length)], s: 26 + rnd() * 26 });
    }
  }
  track.decorations = decos;
  return track;
}

export function segPoint(track, i, x, y) {
  const a = track.pts[i];
  const b = track.pts[(i + 1) % track.pts.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + dx * t;
  const py = a[1] + dy * t;
  return { d: Math.hypot(x - px, y - py), t };
}

export function nearest(track, x, y) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < track.pts.length; i++) {
    const r = segPoint(track, i, x, y);
    if (r.d < best.d) best = { d: r.d, i, t: r.t };
  }
  return best;
}

/** Updates prog = { idx, s, total } and returns nothing. Ignores big jumps so cutting across grass earns no distance. */
export function trackProgress(track, prog, x, y) {
  const n = track.pts.length;
  let best = { d: Infinity, i: prog.idx, t: 0 };
  for (let k = -10; k <= 10; k++) {
    const i = (prog.idx + k + n) % n;
    const r = segPoint(track, i, x, y);
    if (r.d < best.d) best = { d: r.d, i, t: r.t };
  }
  if (best.d > track.width) best = nearest(track, x, y);
  const s = track.cum[best.i] + best.t * track.segLen[best.i];
  let delta = s - prog.s;
  if (delta > track.length / 2) delta -= track.length;
  else if (delta < -track.length / 2) delta += track.length;
  if (Math.abs(delta) < 220) prog.total += delta;
  prog.s = s;
  prog.idx = best.i;
}

const heart = (t) => {
  const s = Math.sin(t);
  return [16 * s * s * s * 62, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 62];
};
const wobblyOval = (t) => [1150 * Math.cos(t), 600 * Math.sin(t) + 150 * Math.sin(3 * t)];
const infinity = (t) => {
  const d = 1 + Math.sin(t) ** 2;
  return [(1250 * Math.cos(t)) / d, (1250 * Math.sin(t) * Math.cos(t)) / d];
};
const town = [
  [0, 0], [600, -80], [1000, 150], [1100, 600], [800, 820], [600, 560], [300, 720], [150, 1120],
  [-400, 1060], [-620, 720], [-350, 460], [-760, 200], [-620, -260], [-220, -320],
];

export const TRACKS = [
  {
    id: 'heart',
    name: 'Heartbeat Circuit',
    emoji: '💗',
    note: 'Two hairpins at the top and the tip. Brake early.',
    width: 170,
    seed: 11,
    grass: '#86c47a',
    grass2: '#78b86c',
    road: '#4b4560',
    kerb: ['#ff5d8f', '#fff4f6'],
    decos: ['🌷', '🌸', '🌳', '🌼', '🍓'],
    raw: param(heart, 260, Math.PI / 2),
  },
  {
    id: 'moon',
    name: 'Moonlight Wiggle',
    emoji: '🌙',
    note: 'Long, wavy and fast. Good for top-speed cars.',
    width: 180,
    seed: 23,
    grass: '#2c3f6b',
    grass2: '#28395f',
    road: '#59607f',
    kerb: ['#f5c24b', '#fbf3e4'],
    decos: ['⭐', '✨', '🌲', '🏮', '🦉'],
    raw: param(wobblyOval, 240, Math.PI / 2),
  },
  {
    id: 'infinity',
    name: 'Forever Loop',
    emoji: '♾️',
    note: 'A figure eight. You cross the middle twice per lap.',
    width: 165,
    seed: 37,
    grass: '#e6c98f',
    grass2: '#dcbd80',
    road: '#5f5346',
    kerb: ['#3e6be0', '#ffffff'],
    decos: ['🌴', '🌵', '🐚', '⛱️', '🦀'],
    raw: param(infinity, 260, 0.62),
  },
  {
    id: 'town',
    name: 'Twisty Town',
    emoji: '🏙️',
    note: 'Tight city corners. Handling beats speed here.',
    width: 160,
    seed: 51,
    grass: '#9aa7a0',
    grass2: '#8f9c95',
    road: '#3f4048',
    kerb: ['#e8434c', '#f6f6f6'],
    decos: ['🏠', '🏢', '🌳', '🚏', '🏪'],
    raw: catmull(town, 18),
  },
].map(build);
