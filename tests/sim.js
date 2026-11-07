// Headless run of the real game.js with stubbed DOM/WebGL. Usage: node sim.js <game.js> [track.glb]
const fs = require('fs'), path = require('path');
const THREE = require('./node_modules/three/build/three.js');
globalThis.THREE = THREE;
new Function(fs.readFileSync('./node_modules/three/examples/js/loaders/GLTFLoader.js', 'utf8'))();
THREE.WebGLRenderer = class { setPixelRatio() {} setSize() {} render() {} };

const handlers = {}, els = {};
const calls = {};
const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls[k] = (calls[k] || 0) + 1; }, set: () => true });
const mk = () => { const o = { hidden: false, style: {}, className: '', dataset: {}, disabled: false, width: 0, height: 0, children: [], _t: '',
  classList: { toggle() {} }, appendChild(c) { this.children.push(c); }, setAttribute() {}, click() {}, getContext: () => ctx,
  addEventListener(t, f) { (this.h = this.h || {})[t] = f; } };
  Object.defineProperty(o, 'textContent', { get() { return this._t; }, set(v) { this._t = v; if (v === '') this.children = []; } }); return o; };
globalThis.document = { getElementById: (id) => els[id] || (els[id] = mk()), createElement: () => mk(), querySelectorAll: () => [], addEventListener() {}, hidden: false };
// courses/ folder served by a fake fetch: the real manifest plus deliberately broken entries
const cdir = path.join(path.dirname(path.resolve(process.argv[2])), 'courses'), hasCourses = fs.existsSync(path.join(cdir, 'courses.json'));
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(url); const name = decodeURIComponent(url.replace(/^courses\//, ''));
  const body = (b) => ({ ok: true, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  if (name === 'courses.json') { const list = JSON.parse(fs.readFileSync(path.join(cdir, 'courses.json'))); list.push({ file: '../game.js' }, { file: 'missing.glb' }, { file: 'nocp.glb', name: 'No CP' }, { file: 'garbage.glb' }, { id: 'kerb', file: 'lakeside-sprint.glb' }, 'nonsense', { file: 'lakeside-sprint.glb', id: 'lakeside' }); return body(Buffer.from(JSON.stringify(list))); }
  if (name === 'nocp.glb' && process.argv[4]) return body(fs.readFileSync(process.argv[4]));
  if (name === 'garbage.glb') return body(Buffer.from([1, 2, 3, 4]));
  const f = path.join(cdir, name); return fs.existsSync(f) ? body(fs.readFileSync(f)) : { ok: false };
};
globalThis.window = { location: { protocol: 'http:' }, get AudioContext() { return globalThis.AudioContext; }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); } };

const audioLog = { ctx: 0, osc: 0, freqSets: [], gainMax: 0 };
const param = (n) => ({ value: 0, setTargetAtTime(v) { if (n === 'f') audioLog.freqSets.push(v); if (n === 'g') audioLog.gainMax = Math.max(audioLog.gainMax, v); } });
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param('g'), frequency: param('f'), pan: param('p'), type: '' });
globalThis.AudioContext = class { constructor() { audioLog.ctx++; this.state = 'running'; this.currentTime = 0; this.destination = node(); }
  createGain() { return node(); } createStereoPanner() { return node(); } createBiquadFilter() { return node(); } createDynamicsCompressor() { return node(); }
  createOscillator() { audioLog.osc++; return node(); } resume() {} suspend() {} };
let raf = null; globalThis.requestAnimationFrame = (f) => { raf = f; };

let src = fs.readFileSync(process.argv[2], 'utf8');
src = src.replace('requestAnimationFrame(frame);\n})();', 'globalThis.__dbg = { racers, player, get N() { return N; }, get HALF() { return HALF; }, get state() { return state; }, get pts() { return pts; }, get pads() { return pads; }, get raceT() { return raceT; }, selectCourse, COURSES, get trackLen() { return trackLen; } };\nrequestAnimationFrame(frame);\n})();');
src = src.replace('const readInput = () => ({', 'const readInput = () => globalThis.__inp ? globalThis.__inp() : ({');
new Function(src)();
const D = globalThis.__dbg;

let now = 0; const tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; raf(now); } };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the player follows the centreline with the same pure-pursuit idea the bots use
globalThis.__inp = () => {
  const p = D.player, k = (p.idx + 8) % D.N, t = D.pts[k];
  const d = wrap(Math.atan2(t.x - p.x, t.z - p.z) - p.h);
  return { steer: Math.max(-1, Math.min(1, d * 2.2)), gas: Math.abs(d) < 0.5 || p.speed < 18, brake: Math.abs(d) > 0.9 && p.speed > 22, drift: false };
};

const window_ev = (t) => (handlers[t] || []).forEach((f) => f({ code: 'x', target: {} }));
function race(label) {
  window_ev('pointerdown'); els.go.h.click({}); tick(60 * 3 + 30);                       // countdown
  let guard = 0, minSp = 0; while (D.state !== 'done' && guard++ < 60 * 400) { tick(1); for (const r of D.racers) if (r.finished) minSp = Math.min(minSp, r.speed); }
  tick(60 * 6); for (const r of D.racers) minSp = Math.min(minSp, r.speed);
  const stopped = D.racers.every((r) => !r.finished || r.speed === 0); console.log(`  finished karts: min speed ${minSp.toFixed(2)}, all stopped=${stopped}`);
  const lines = D.racers.map((r) => `${r.name.padEnd(7)} laps=${r.laps} finished=${r.finished} t=${r.finishT.toFixed(1)}s`);
  console.log(`[${label}] N=${D.N} half=${D.HALF.toFixed(1)} pads=${D.pads.length} state=${D.state} t=${D.raceT.toFixed(1)}s\n  ` + lines.join('\n  '));
  console.log('  best lap HUD:', els.best.textContent);
  // pass = player finished 3 laps and every bot is on lap 3 (bots run a little slower than a perfect player by design)
  return D.player.finished && D.racers.every((r) => r.laps >= 2) && minSp >= 0 && stopped;
}


function geometry(label) {
  const P = D.pts, n = P.length, sp = D.trackLen / n; let rmin = 1e9, sep = 1e9, slope = 0;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 3 + n) % n], b = P[i], c = P[(i + 3) % n];
    const ab = Math.hypot(a.x - b.x, a.z - b.z), bc = Math.hypot(b.x - c.x, b.z - c.z), ca = Math.hypot(c.x - a.x, c.z - a.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    if (area > 1e-6) rmin = Math.min(rmin, ab * bc * ca / (4 * area));
    slope = Math.max(slope, Math.abs(P[(i + 1) % n].y - b.y) / sp);
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.min(j - i, n - (j - i)) * sp < 50) continue;
    sep = Math.min(sep, Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z));
  }
  const radiusAt = (i) => { const a = P[(i - 6 + n) % n], b = P[i], c = P[(i + 6) % n];
    const ab = Math.hypot(a.x - b.x, a.z - b.z), bc = Math.hypot(b.x - c.x, b.z - c.z), ca = Math.hypot(c.x - a.x, c.z - a.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2; return area < 1e-6 ? 9999 : ab * bc * ca / (4 * area); };
  const padR = D.pads.map((p) => { let bi = 0, bd = 1e12; P.forEach((q, i) => { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }); return Math.min(radiusAt(bi), 999).toFixed(0); });
  console.log('  local corner radius at each boost pad (m):', padR.join(', '));
  const need = 2 * D.HALF + 6, yMin = Math.min(...P.map((p) => p.y)), yMax = Math.max(...P.map((p) => p.y));
  const good = rmin >= 14 && sep >= need && yMin >= 0;
  console.log(`[geometry ${label}] length=${D.trackLen.toFixed(0)}m half=${D.HALF} tightest radius=${rmin.toFixed(1)}m  closest approach=${sep.toFixed(1)}m (need >= ${need})  height ${yMin.toFixed(1)}..${yMax.toFixed(1)}m  max slope=${(slope * 100).toFixed(0)}%  ${good ? 'OK' : 'PROBLEM'}`);
  return good;
}
(async () => {
  tick(5);
  if (hasCourses) {
    await new Promise((r) => setTimeout(r, 600)); tick(2);
    const ids = D.COURSES.map((c) => c.id).join(',');
    console.log('courses after loading courses/ :', ids, '| picker buttons:', els.picker.children.length);
    const okLoad = /^kerb,harbour,ridge,lakeside$/.test(ids) && els.picker.children.length === 4 && !fetched.some((u) => u.includes('..'));
    console.log(okLoad ? 'PASS  courses/ folder: good course added, broken/duplicate/escaping entries ignored' : 'FAIL  courses/ folder loading');
    if (!okLoad) process.exitCode = 1;
  }
  let ok = true;
  for (const c of D.COURSES) {
    D.selectCourse(c.id);
    ok = geometry(c.name) && ok;
    console.log('  blurb:', els.coursemsg.textContent);
    ok = race(c.name) && ok;
    els.tomenu.h.click(); tick(5);
  }
  const tagDraws = 6; // the six name tags also clear their own small canvas once at startup
  console.log(`minimap: ${calls.clearRect - tagDraws} frames drawn, ${calls.arc} bot dots (expect 5 per frame = ${(calls.clearRect - tagDraws) * 5})`);
  ok = ok && calls.arc === (calls.clearRect - tagDraws) * 5;
  if (process.argv[3]) {
    const load = (p) => { const b = fs.readFileSync(p); return { name: path.basename(p), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
    handlers.drop[0]({ preventDefault() {}, dataTransfer: { files: [load(process.argv[3])] } });
    await new Promise((r) => setTimeout(r, 300));
    console.log('after import:', els.coursemsg.textContent);
    ok = race('imported') && ok; els.tomenu.h.click(); tick(5);
    D.selectCourse('harbour'); D.selectCourse('imported'); await new Promise((r) => setTimeout(r, 300));
    console.log('re-select imported after a built-in:', els.coursemsg.textContent);
    const bad = { name: 'bad.glb', arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    handlers.drop[0]({ preventDefault() {}, dataTransfer: { files: [bad] } }); await new Promise((r) => setTimeout(r, 200));
    console.log('after bad file:', els.coursemsg.textContent);
    handlers.drop[0]({ preventDefault() {}, dataTransfer: { files: [load(process.argv[4])] } }); await new Promise((r) => setTimeout(r, 300));
    console.log('after no-CP file:', els.coursemsg.textContent, '| half still', D.HALF.toFixed(1));
  }
  console.log(`audio: contexts=${audioLog.ctx} oscillators=${audioLog.osc} (expect 12 = 6 karts x 2) freq updates=${audioLog.freqSets.length} max gain=${audioLog.gainMax.toFixed(3)}`);
  ok = ok && audioLog.ctx === 1 && audioLog.osc === 12 && audioLog.freqSets.length > 1000 && audioLog.gainMax > 0.01;
  console.log(ok && !process.exitCode ? 'RESULT: PASS' : 'RESULT: FAIL');
})();
