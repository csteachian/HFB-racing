// Searches for long (3-4 km), hilly, non-self-crossing closed circuits and prints them as COURSES control points.
// Usage: node gen_courses.js   (run npm install in ../tests first; it prints control points to paste into COURSES)
const THREE = require('../tests/node_modules/three');
let s0 = 1; const rng = (seed) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const SPECS = [
  { id: 'summit', half: 11, seed: 11, hAmp: 26, len: [3300, 3900], harm: 5 },
  { id: 'canyon', half: 12, seed: 23, hAmp: 14, len: [3400, 4000], harm: 6 },
  { id: 'harvest', half: 11, seed: 37, hAmp: 9, len: [3000, 3500], harm: 4 },
  { id: 'coast', half: 12, seed: 41, hAmp: 12, len: [3500, 4000], harm: 5 },
  { id: 'moon', half: 10, seed: 59, hAmp: 22, len: [3100, 3700], harm: 6 },
];
function analyse(ctrl, half) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.5), L = curve.getLength();
  const N = Math.max(120, Math.min(1000, Math.round(L / 2.5))), P = curve.getSpacedPoints(N).slice(0, N), sp = L / N;
  let rmin = 1e9, slope = 0, ymin = 1e9, ymax = -1e9, turn = 0;
  for (let i = 0; i < N; i++) {
    const a = P[(i - 3 + N) % N], b = P[i], c = P[(i + 3) % N];
    const ab = Math.hypot(a.x - b.x, a.z - b.z), bc = Math.hypot(b.x - c.x, b.z - c.z), ca = Math.hypot(c.x - a.x, c.z - a.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    if (area > 1e-6) { const r = ab * bc * ca / (4 * area); rmin = Math.min(rmin, r); turn += 1 / r; }
    slope = Math.max(slope, Math.abs(P[(i + 1) % N].y - b.y) / sp); ymin = Math.min(ymin, b.y); ymax = Math.max(ymax, b.y);
  }
  let sep = 1e9; const skip = Math.ceil(80 / sp);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { if (Math.min(j - i, N - (j - i)) < skip) continue; const d = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z); if (d < sep) sep = d; }
  return { L, N, rmin, sep, slope, ymin, ymax, turn };
}
function candidate(spec, rnd) {
  const M = 44, ph = Array.from({ length: 8 }, () => rnd() * 6.283), amp = [], H = spec.harm;
  for (let k = 2; k <= H; k++) amp[k] = (0.06 + rnd() * 0.22) / Math.pow(k, 0.55);
  const ax = 1 + rnd() * 0.7, az = 1, rot = rnd() * 6.283;
  const hb = [0, 1, 2, 3].map((k) => (0.35 + rnd() * 0.65) / (k + 1)), hp = [0, 1, 2, 3].map(() => rnd() * 6.283);
  const raw = [];
  for (let j = 0; j < M; j++) {
    const t = (2 * Math.PI * j) / M; let r = 1; for (let k = 2; k <= H; k++) r += amp[k] * Math.cos(k * t + ph[k]);
    let x = r * Math.cos(t) * ax, z = r * Math.sin(t) * az; const c = Math.cos(rot), s = Math.sin(rot);
    let y = 0; for (let k = 0; k < 4; k++) y += hb[k] * Math.sin((k + 1) * t + hp[k]);
    raw.push([x * c - z * s, x * s + z * c, y]);
  }
  const ys = raw.map((p) => p[2]), lo = Math.min(...ys), hi = Math.max(...ys);
  return { raw, lo, hi };
}
for (const spec of SPECS) {
  const rnd = rng(spec.seed); let best = null, tried = 0;
  while (tried < 4000) {
    tried++; const { raw, lo, hi } = candidate(spec, rnd);
    // scale the plan to a target length, then the heights to the hill amplitude
    const unit = analyse(raw.map(([x, z]) => [x * 100, z * 100, 0]), spec.half), target = spec.len[0] + rnd() * (spec.len[1] - spec.len[0]), k = (target / unit.L) * 100;
    const ctrl = raw.map(([x, z, y]) => [Math.round(x * k), Math.round(z * k), Math.round(((y - lo) / (hi - lo)) * spec.hAmp * 10 + 5) / 10]);
    const a = analyse(ctrl, spec.half), need = 2 * spec.half + 14;
    if (a.L < spec.len[0] || a.L > spec.len[1] || a.rmin < 28 || a.sep < need || a.slope > 0.11 || a.ymin < 0.2) continue;
    const score = a.turn; if (!best || score > best.score) best = { ctrl, a, score };
  }
  if (!best) { console.error('no valid candidate for', spec.id); continue; }
  const a = best.a; console.error(`${spec.id}: length ${a.L.toFixed(0)} m, tightest radius ${a.rmin.toFixed(0)} m, closest approach ${a.sep.toFixed(0)} m (need ${2 * spec.half + 14}), slope ${(a.slope * 100).toFixed(1)}%, height ${a.ymin.toFixed(1)}..${a.ymax.toFixed(1)} m`);
  console.log(`// ${spec.id}\n[${best.ctrl.map((p) => `[${p.join(',')}]`).join(',')}]`);
}
