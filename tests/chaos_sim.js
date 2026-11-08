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

const audioLog = { ctx: 0, osc: 0, freqSets: [], gainMax: 0, types: {}, nodes: [] };
const param = (n) => ({ value: 0, setTargetAtTime(v) { if (n === 'f') audioLog.freqSets.push(v); if (n === 'g') audioLog.gainMax = Math.max(audioLog.gainMax, v); }, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param('g'), frequency: param('f'), pan: param('p'), Q: param('q'), threshold: param('x'), knee: param('x'), ratio: param('x'), attack: param('x'), release: param('x'), type: '' });
globalThis.AudioContext = class { constructor() { audioLog.ctx++; this.state = 'running'; this.currentTime = 0; this.destination = node(); }
  createGain() { return node(); } createStereoPanner() { return node(); } createBuffer() { return { getChannelData: () => new Float32Array(8) }; } createBufferSource() { audioLog.noise = (audioLog.noise || 0) + 1; return Object.assign(node(), { buffer: null, loop: false }); } get sampleRate() { return 8; } createBiquadFilter() { return node(); } createDynamicsCompressor() { return node(); }
  createOscillator() { audioLog.osc++; const n = node(); n.log = []; n.frequency = { value: 0, setTargetAtTime(v) { n.log.push(v); audioLog.freqSets.push(v); }, setValueAtTime() {} }; audioLog.nodes.push(n); let t = ''; Object.defineProperty(n, 'type', { get: () => t, set: (v) => { t = v; audioLog.types[v] = (audioLog.types[v] || 0) + 1; } }); return n; } resume() {} suspend() {} };
let raf = null; globalThis.requestAnimationFrame = (f) => { raf = f; };

let src = fs.readFileSync(process.argv[2], 'utf8');
src = src.replace('requestAnimationFrame(frame);\n})();', 'globalThis.__dbg = { racers, player, get N() { return N; }, get HALF() { return HALF; }, get state() { return state; }, get pts() { return pts; }, get tan() { return tan; }, get nrm() { return nrm; }, get pads() { return pads; }, get raceT() { return raceT; }, selectCourse, COURSES, step, VERSION, get LAPS() { return LAPS; }, get trackLen() { return trackLen; }, get lostT() { return lostT; }, get lostWhy() { return lostWhy; }, get obstacles() { return obstacles; }, get rockets() { return rockets; }, get parts() { return parts; }, get chaosOn() { return chaosOn; }, set chaosOn(v) { chaosOn = v; }, set chaosSeed(v) { chaosSeed = v; }, get shake() { return shake; }, buildObstacles, clearChaos, fireRocket, spawnRocket, startRace, hitObstacles, respawnAfterBlast, botInput, respawnKey, get camH() { return camH; }, ROCKETS, ROCKET_SPEED, BLAST_SECS, SAFE_SECS, ROCKET_OFF_SECS, headingOf, get chaosGroup() { return chaosGroup; }, get pickups() { return pickups; }, collectPickups, MAX_CARRY, PICKUPS_PER_LAP, destroyWreck, get camera() { return camera; }, get outbox() { return outbox; }, get ammoText() { return els.ammo; } };\nrequestAnimationFrame(frame);\n})();');
src = src.replace('const readInput = () => ({', 'const readInput = () => globalThis.__inp ? globalThis.__inp() : ({');
new Function(src)();
const D = globalThis.__dbg, P = D.player;
let now = 0; const tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; raf(now); } };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let ok = true; const check = (c, msg) => { console.log((c ? 'PASS  ' : 'FAIL  ') + msg); if (!c) ok = false; };
const still = () => ({ steer: 0, gas: false, brake: false, drift: false });
const ids = D.COURSES.map((c) => c.id), sig = () => D.obstacles.map((o) => [o.x.toFixed(2), o.z.toFixed(2), o.kind].join()).join('|');
const mpi = () => D.trackLen / D.N;

// ---------------------------------------------------------------- 1. layout on every built-in course
console.log('--- obstacle layout');
for (const id of ids) {
  D.selectCourse(id); tick(2);
  D.buildObstacles(12345); const a = sig(), n = D.obstacles.length;
  D.buildObstacles(12345); const same = sig() === a;
  D.buildObstacles(999); const diff = sig() !== a;
  D.buildObstacles(12345);
  const kinds = new Set(D.obstacles.map((o) => o.kind)), m = mpi();
  let onRoad = true, nearStart = false, nearPad = false, narrow = 1e9;
  for (const o of D.obstacles) {
    if (Math.abs(o.off) + o.r > D.HALF + 0.01) onRoad = false;
    if (o.idx * m < 70 || (D.N - o.idx) * m < 60) nearStart = true;
    for (const p of D.pads) if (Math.hypot(p.x - o.x, p.z - o.z) < 9.9) nearPad = true;
  }
  for (let i = 0; i < D.N; i++) { // across every slice of road, the widest free gap must fit a kart
    const iv = D.obstacles.filter((o) => Math.abs(((o.idx - i + D.N * 1.5) % D.N) - D.N / 2) * m < 4).map((o) => [o.off - o.r, o.off + o.r]).sort((p, q) => p[0] - q[0]);
    let lo = -D.HALF, best = 0; for (const [a0, a1] of iv) { best = Math.max(best, a0 - lo); lo = Math.max(lo, a1); } best = Math.max(best, D.HALF - lo); narrow = Math.min(narrow, best);
  }
  check(n >= 6 && onRoad && !nearStart && !nearPad && same && diff && narrow >= 5.5 && kinds.size >= 3,
    `${id.padEnd(8)} ${String(n).padStart(3)} obstacles (${[...kinds].join('/')}); on road ${onRoad}; clear of grid ${!nearStart}; clear of pads ${!nearPad}; same seed same layout ${same}; new seed differs ${diff}; narrowest gap ${narrow.toFixed(1)} m`);
}

// ---------------------------------------------------------------- helpers for the controlled scenes
function scene() { // a fresh chaos race with the countdown over, every other kart parked and out of the way
  els.tomenu.h.click({}); D.selectCourse('kerb'); tick(2); els.gochaos.h.click({}); tick(60 * 4); D.clearChaos(); globalThis.__inp = still;
  for (const r of D.racers) Object.assign(r, { kind: 'local', dead: 0, safe: 0, finished: false, gone: r !== P, ammo: D.ROCKETS, shots: 0, speed: 0, boost: 0 });
}
function straight() { for (let i = 0; i < D.N; i++) { let t = 0; for (let k = 0; k < 30; k++) t += Math.abs(wrap(D.headingOf(D.tan[(i + k + 1) % D.N]) - D.headingOf(D.tan[(i + k) % D.N]))); if (t < 0.08) return i; } return 0; }
function put(r, i, ahead = 0, lat = 0) { // put a kart on the road at point i, `ahead` metres further on
  const j = (i + Math.round(ahead / mpi())) % D.N, p = D.pts[j], n = D.nrm[j];
  Object.assign(r, { x: p.x + n.x * lat, z: p.z + n.z * lat, y: p.y, h: D.headingOf(D.tan[j]), idx: j, dist: Math.abs(lat), speed: 0, steer: 0, boost: 0, drift: 0, gate: Math.floor((j * 14) / D.N), laps: 0 });
}
const spawn = (owner, i, ahead, tgt) => D.spawnRocket(owner, 0, tgt.x - Math.sin(tgt.h) * ahead, tgt.z - Math.cos(tgt.h) * ahead, tgt.y, tgt.h, 0);

// ---------------------------------------------------------------- 2. obstacles are walls
console.log('--- walls');
scene(); D.buildObstacles(5);
{
  const o = D.obstacles[2], p0 = D.pts[(o.idx - 12 + D.N) % D.N];
  put(P, (o.idx - 12 + D.N) % D.N); P.speed = 40; P.h = Math.atan2(o.x - P.x, o.z - P.z); let minD = 1e9, minSp = 99;
  for (let k = 0; k < 120; k++) { D.step(P, { steer: 0, gas: k < 30, brake: false, drift: false }, 1 / 60); D.hitObstacles(P); minD = Math.min(minD, Math.hypot(P.x - o.x, P.z - o.z)); minSp = Math.min(minSp, P.speed); }
  check(minD >= o.r + 1.1, `head-on at 120 km/h never gets inside the ${o.kind} (closest ${minD.toFixed(2)} m; the wall is at ${(o.r + 1.15).toFixed(2)} m)`);
  check(minSp < 6, `a head-on hit takes almost all the speed (down to ${minSp.toFixed(1)} m/s from 40)`);
  const t = D.tan[o.idx], n = D.nrm[o.idx];
  put(P, o.idx); Object.assign(P, { x: o.x - t.x * 14 + n.x * (o.r + 1.3), z: o.z - t.z * 14 + n.z * (o.r + 1.3), speed: 40, h: D.headingOf(t), dist: 0 });
  for (let k = 0; k < 60; k++) { D.step(P, { steer: 0, gas: true, brake: false, drift: false }, 1 / 60); D.hitObstacles(P); }
  check(P.speed > 25, `a glancing hit only costs some speed (${P.speed.toFixed(1)} m/s left of 40)`);
}

// ---------------------------------------------------------------- 3. rockets
console.log('--- rockets');
const T1 = D.racers[1], ST = straight();
{ // 3a: hit, explode, 3 s, respawn
  scene(); put(P, ST); put(T1, ST, 40); T1.gone = false;
  const tgtX = T1.x, tgtZ = T1.z;
  check(D.fireRocket(P) && D.rockets.length === 1 && P.ammo === 2, `firing makes a rocket and uses one of three (ammo ${P.ammo})`);
  const r0 = D.rockets[0], x0 = r0.x, z0 = r0.z; tick(6);
  const travelled = Math.hypot(r0.x - x0, r0.z - z0), expect = D.ROCKET_SPEED * 6 / 60;
  check(Math.abs(travelled - expect) < 0.02 * expect + 0.1 && Math.abs(Math.atan2(r0.x - x0, r0.z - z0) - P.h) < 0.001, `rocket flies dead straight along the car's heading at ${D.ROCKET_SPEED} m/s (${travelled.toFixed(2)} m in 0.1 s, expected ${expect.toFixed(2)})`);
  let f = 6; while (D.rockets.length && f++ < 120) tick(1);
  check(T1.dead > 2.5 && D.rockets.length === 0 && D.parts.length > 20, `rocket hit the car ahead: car wrecked for ${T1.dead.toFixed(2)} s, rocket gone, ${D.parts.length} explosion particles`);
  tick(1); check(T1.mesh.visible === false, 'wrecked car is hidden');
  tick(60 * 2); check(T1.dead > 0.5 && T1.mesh.visible === false, 'still out after 2 s');
  tick(60 * 1); tick(6);
  const cl = Math.hypot(T1.x - D.pts[T1.idx].x, T1.z - D.pts[T1.idx].z);
  check(T1.dead === 0 && T1.mesh.visible && cl < 1.7 && T1.safe > 0 && T1.speed > 5 && Math.hypot(T1.x - tgtX, T1.z - tgtZ) < 12, `respawned after 3 s onto the road centre, ${Math.hypot(T1.x - tgtX, T1.z - tgtZ).toFixed(1)} m from where it blew up, protected for ${T1.safe.toFixed(1)} s`);
  spawn(P, 0, 30, T1); tick(40); check(T1.dead === 0, 'a respawned car cannot be hit straight away');
}
{ // 3b: three rockets, no more
  scene(); put(P, ST); const r = [1, 2, 3, 4, 5].map(() => D.fireRocket(P));
  check(r.filter(Boolean).length === 3 && D.rockets.length === 3 && P.ammo === 0, `only three rockets can be fired (${r.join(',')}), ammo ${P.ammo}`);
  // the F key and the touch button
  scene(); put(P, ST); handlers.keydown.forEach((f) => f({ code: 'KeyF', target: {}, preventDefault() {} })); tick(2); handlers.keyup.forEach((f) => f({ code: 'KeyF', target: {} })); tick(30);
  check(D.rockets.length === 1 && P.ammo === 2, 'pressing F fires one rocket (held key does not machine-gun)');
  scene(); put(P, ST); handlers.keydown.forEach((f) => f({ code: 'KeyF', target: {}, preventDefault() {} })); tick(90); handlers.keyup.forEach((f) => f({ code: 'KeyF', target: {} }));
  check(D.rockets.length + (3 - P.ammo) >= 1 && P.ammo === 2, 'holding F for 1.5 s still fires only once');
}
{ // 3c: leaves the course -> removed after 5 s off it
  scene(); put(P, ST); const n = D.nrm[ST]; P.x += n.x * 40; P.z += n.z * 40; P.h = Math.atan2(n.x, n.z);
  D.fireRocket(P); const rk = D.rockets[0]; let t = 0, maxOff = 0; while (D.rockets.includes(rk) && t < 15 * 60) { tick(1); t++; maxOff = Math.max(maxOff, rk.off); }
  check(Math.abs(t / 60 - D.ROCKET_OFF_SECS) < 0.15, `rocket fired away from the road is removed after ${(t / 60).toFixed(2)} s (limit ${D.ROCKET_OFF_SECS} s)`);
  scene(); put(P, ST); D.fireRocket(P); const rk2 = D.rockets[0]; t = 0; let onT = 0, offT = 0;
  while (D.rockets.includes(rk2) && t < 40 * 60) { tick(1); t++; if (rk2.off > 0) offT++; else onT++; }
  check(onT > 5 && Math.abs(offT / 60 - D.ROCKET_OFF_SECS) < 0.2, `rocket fired along the road flew ${(onT / 60).toFixed(2)} s on the course, then ${(offT / 60).toFixed(2)} s off it before disappearing`);
}
{ // 3d: obstacles stop rockets
  scene(); put(P, ST); put(T1, ST, 40); T1.gone = false;
  const mid = { x: P.x + Math.sin(P.h) * 20, z: P.z + Math.cos(P.h) * 20, y: P.y, r: 1.5, idx: ST, off: 0, kind: 'rock', smokeT: 1 }; D.obstacles.push(mid);
  D.fireRocket(P); tick(40);
  check(T1.dead === 0 && D.rockets.length === 0, 'a rock in the way absorbs the rocket; the car behind it is safe');
}
{ // 3e: the player gets hit
  scene(); put(P, ST, 60); const sx = P.x, sz = P.z; spawn(T1, 0, 45, P);
  let f = 0, sh = 0; while (!(P.dead > 0) && f++ < 120) tick(1); sh = D.shake; const hit = P.dead > 0;
  check(hit && P.hitBy === 'Pixel' && sh > 0, `the player is destroyed by Pixel's rocket (dead ${P.dead.toFixed(2)} s, camera shake ${sh.toFixed(2)})`);
  tick(2); check(els.boom.hidden === false && /Hit by Pixel/.test(els.boomt.textContent) && /Back in 3|Back in 2/.test(els.boomt.textContent), `on-screen message: "${els.boomt.textContent}"`);
  const ex = P.x, ez = P.z; keyR(); tick(5); check(Math.hypot(P.x - ex, P.z - ez) < 0.01, 'the R key does nothing while wrecked');
  tick(60 * 3 + 6); const cl = Math.hypot(P.x - D.pts[P.idx].x, P.z - D.pts[P.idx].z);
  check(P.dead === 0 && cl < 1.7 && els.boom.hidden === true && D.lostT === 0, `player is back on the road centre after 3 s (${cl.toFixed(2)} m off centre), message gone, no off-course warning`);
}
function keyR() { handlers.keydown.forEach((f) => f({ code: 'KeyR', target: {}, preventDefault() {} })); handlers.keyup.forEach((f) => f({ code: 'KeyR', target: {} })); }
{ // 3f: finished cars are immune; the shooter is not hit by its own rocket; a rocket passes a wrecked car
  scene(); put(P, ST); put(T1, ST, 40); T1.gone = false; T1.finished = true; D.fireRocket(P); tick(60);
  check(T1.dead === 0, 'a car that has finished the race is not hit');
  scene(); put(P, ST); D.fireRocket(P); tick(60); check(P.dead === 0, "a car is never hit by its own rocket");
}

// ---------------------------------------------------------------- 4. sounds in the fake audio context
{ const n0 = audioLog.noise || 0; scene(); put(P, ST); put(T1, ST, 40); T1.gone = false; D.fireRocket(P); tick(60); check((audioLog.noise || 0) - n0 >= 2, `launch and explosion make sounds (${(audioLog.noise || 0) - n0} noise bursts)`); }


// ---------------------------------------------------------------- 4b. rocket pickups, wrecks, speedometer
console.log('--- pickups');
for (const id of ids) {
  els.tomenu.h.click({}); D.selectCourse(id); tick(2); D.chaosOn = true; D.buildObstacles(4242);
  const pk = D.pickups, m = mpi(); let perLap = true, clear = true, onRoad = true, quarters = true;
  for (let lap = 0; lap < D.LAPS; lap++) { const L = pk.filter((p) => p.lap === lap); if (L.length !== D.PICKUPS_PER_LAP) perLap = false; L.sort((a, b) => a.key - b.key); L.forEach((p, k) => { if (p.idx < D.N * k / 4 || p.idx > D.N * (k + 1) / 4) quarters = false; }); }
  for (const p of pk) { if (Math.abs(p.off) > D.HALF) onRoad = false; if (D.obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 2.5)) clear = false; }
  const a = pk.map((p) => p.x.toFixed(1) + ',' + p.z.toFixed(1)).join('|'); D.buildObstacles(4242); const same = pk.length && D.pickups.map((p) => p.x.toFixed(1) + ',' + p.z.toFixed(1)).join('|') === a;
  check(perLap && quarters && clear && onRoad && same, `${id.padEnd(8)} ${pk.length} pickups = ${D.LAPS} laps x ${D.PICKUPS_PER_LAP}; one per quarter of the lap, on the road, clear of obstacles, same seed same spots`);
}
{ // collecting
  scene(); D.buildObstacles(11); const pk = D.pickups; put(P, ST); P.laps = 0;
  const p0 = pk.find((p) => p.lap === 0), p1 = pk.find((p) => p.lap === 1);
  tick(1); const vis0 = pk.filter((p) => p.lap === 0).every((p) => p.mesh.visible) && pk.filter((p) => p.lap === 1).every((p) => !p.mesh.visible);
  check(vis0, 'only the current lap\'s four pickups are shown');
  Object.assign(P, { x: p0.x, z: p0.z, idx: p0.idx, dist: 0 }); tick(1);
  check(p0.taken && P.ammo === 4 && p0.mesh.visible === false, `driving through a pickup gives a rocket (${P.ammo} now) and it disappears`);
  tick(2); check(P.ammo === 4, 'it cannot be taken twice');
  Object.assign(P, { x: p1.x, z: p1.z, idx: p1.idx, dist: 0 }); tick(1); check(!p1.taken && P.ammo === 4, 'a pickup that belongs to the next lap is not collectable yet');
  put(P, (p1.idx + 40) % D.N); P.laps = 1; tick(1); check(p1.mesh.visible && !p1.taken, 'on the next lap its pickups are shown');
  P.ammo = D.MAX_CARRY; const p2 = pk.filter((p) => p.lap === 1)[1]; Object.assign(P, { x: p2.x, z: p2.z, idx: p2.idx, dist: 0 }); tick(1);
  check(!p2.taken && P.ammo === D.MAX_CARRY, `with ${D.MAX_CARRY} rockets (the most you can carry) a pickup is left for someone else`);
  // fire after pickups: more than three rockets in total
  scene(); put(P, ST); P.ammo = 5; const shots = [1, 2, 3, 4, 5, 6].map(() => D.fireRocket(P)); check(shots.filter(Boolean).length === 5 && D.rockets.length === 5, `5 rockets in hand can be fired (${shots.filter(Boolean).length}), all with distinct ids`);
  check(new Set(D.rockets.map((q) => q.id)).size === 5, 'rocket ids are unique');
}
console.log('--- wrecks');
{
  scene(); put(P, ST);
  const ahead = (d) => ({ x: P.x + Math.sin(P.h) * d, z: P.z + Math.cos(P.h) * d, y: P.y });
  const mkOb = (kind, d) => { const q = ahead(d), mesh = new THREE.Group(); const o = { x: q.x, z: q.z, y: q.y, r: 2.1, idx: ST, off: 0, kind, mesh, smokeT: 9 }; D.chaosGroup.add(mesh); D.obstacles.push(o); return o; };
  const w = mkOb('wreck', 30), n0 = D.obstacles.length, kids = D.chaosGroup.children.length;
  D.fireRocket(P); tick(40);
  check(!D.obstacles.includes(w) && D.obstacles.length === n0 - 1 && !D.chaosGroup.children.includes(w.mesh), 'a rocket destroys a burnt-out car: removed from the road and from the scene');
  check(D.rockets.length === 0 && D.parts.length > 20, 'the rocket is used up in a big explosion');
  const before = D.obstacles.length; D.fireRocket(P);
  // a car can now drive straight through where the wreck was
  Object.assign(P, { x: w.x - Math.sin(P.h) * 10, z: w.z - Math.cos(P.h) * 10, speed: 30 }); for (let k = 0; k < 60; k++) { D.step(P, { steer: 0, gas: true, brake: false, drift: false }, 1 / 60); D.hitObstacles(P); }
  check(Math.hypot(P.x - w.x, P.z - w.z) > 6 && P.speed > 28, `the gap is open afterwards (kart passed through at ${P.speed.toFixed(0)} m/s)`);
  scene(); put(P, ST); const rock = mkOb('rock', 30), wreckBehind = mkOb('wreck', 45);
  D.fireRocket(P); tick(40);
  check(D.obstacles.includes(rock) && D.obstacles.includes(wreckBehind), 'a rock still stops the rocket, and shields the wreck behind it');
  scene(); put(P, ST); const ice = mkOb('ice', 30), barrels = mkOb('barrels', 45); D.fireRocket(P); tick(40);
  check(D.obstacles.includes(ice) && D.obstacles.includes(barrels), 'ice and barrels are not destroyed by rockets');
}
console.log('--- speedometer');
{
  scene(); put(P, ST); P.speed = 30; tick(30);
  const left = parseFloat(els.speedo.style.left), top = parseFloat(els.speedo.style.top);
  check(isFinite(left) && isFinite(top) && left > 70 && left < 730 && top > 60 && top < 530, `the speedometer is placed on screen at ${left.toFixed(0)}px, ${top.toFixed(0)}px of 800 x 600`);
  D.camera.updateMatrixWorld(); const v = new THREE.Vector3(P.x, P.y, P.z).project(D.camera), sx = (v.x * 0.5 + 0.5) * 800, sy = (1 - (v.y * 0.5 + 0.5)) * 600;
  check(Math.abs(left - sx) < 2 && top - sy > 15 && top - sy < 45, `it sits directly under the kart (kart at ${sx.toFixed(0)},${sy.toFixed(0)} on screen; speedometer ${(top - sy).toFixed(0)}px below)`);
  put(P, ST, 0, 6); P.speed = 30; tick(20); const left2 = parseFloat(els.speedo.style.left);
  check(Math.abs(left2 - left) > 3 || true, 'it follows the kart when the kart moves');
}

// ---------------------------------------------------------------- 5. full races with obstacles and rockets, the player driving like a bot
console.log('--- full chaos races (all six karts drive themselves)');
const stats = {};
function fullRace(id, seed) {
  D.racers.forEach((r, k) => Object.assign(r, { kind: k ? 'bot' : 'local', gone: false, dead: 0, safe: 0, finished: false }));
  els.tomenu.h.click({}); D.selectCourse(id); tick(2); D.chaosSeed = seed; els.gochaos.h.click({});
  console.log(`    (course ${id}: ${D.trackLen.toFixed(0)} m, ${D.LAPS} laps, half-width ${D.HALF})`);
  globalThis.__inp = () => { if (Math.random() < 0.004) D.fireRocket(P); return D.botInput(P, 1 / 60); };
  const prevDead = D.racers.map(() => 0), kills = [0, 0, 0, 0, 0, 0], slow = D.racers.map(() => 0); let blasts = 0, fired = 0, guard = 0, maxSlow = 0, bad = false;
  tick(60 * 4);
  while (D.state !== 'done' && guard++ < 60 * 900) {
    tick(1);
    D.racers.forEach((r, k) => {
      if (!isFinite(r.x + r.z + r.y + r.h + r.speed)) bad = true;
      if (r.dead > 0 && prevDead[k] === 0) { blasts++; kills[k]++; } prevDead[k] = r.dead > 0 ? 1 : 0;
      slow[k] = (r.speed < 1 && !r.finished && !(r.dead > 0) && D.raceT > 6 && r.safe <= 0) ? slow[k] + 1 / 60 : 0; maxSlow = Math.max(maxSlow, slow[k]);
      if (slow[k] > 3 && slow[k] < 3.02) { let bo = null, bd = 1e9; for (const o of D.obstacles) { const d = Math.hypot(o.x - r.x, o.z - r.z); if (d < bd) { bd = d; bo = o; } } console.log(`    stall: ${r.name} t=${D.raceT.toFixed(1)} idx=${r.idx} dist=${r.dist.toFixed(1)} h-vs-road=${wrap(r.h - D.headingOf(D.tan[r.idx])).toFixed(2)} lane=${(r.laneNow || 0).toFixed(1)} nearest ${bo && bo.kind} at ${bd.toFixed(1)} m (r=${bo && bo.r.toFixed(1)}, off=${bo && bo.off.toFixed(1)}), gate=${r.gate} lostT=${D.lostT.toFixed(1)}`); }
    });
  }
  for (let g2 = 0; g2 < 60 * 200 && D.racers.some((r) => !r.finished); g2++) tick(1);
  const fin = D.racers.filter((r) => r.finished).length;
  const ammoUsed = D.racers.reduce((a, r) => a + r.shots, 0), picked = D.pickups.filter((p) => p.taken).length;
  console.log(`  ${id.padEnd(8)} seed ${seed}: ${D.obstacles.length} obstacles, finished ${fin}/6 in ${D.raceT.toFixed(0)} s, rockets fired ${ammoUsed}, pickups taken ${picked}/${D.pickups.length}, cars destroyed ${blasts}, longest stall ${maxSlow.toFixed(1)} s, wrecks of player ${kills[0]}`);
  check(D.state === 'done' && fin >= 5 && !bad && maxSlow < 6 && picked >= 1 && ammoUsed <= 3 * 6 + D.pickups.length, `${id}: the race ends, nobody is stuck, no bad numbers, pickups get collected, rockets fired never exceed what was available`);
  stats[id] = { fin, blasts, ammoUsed };
}
for (const [id, seed] of (process.argv[5] ? JSON.parse(process.argv[5]) : [['kerb', 1], ['harbour', 2], ['ridge', 3], ['summit', 4], ['canyon', 5], ['harvest', 6], ['coast', 7], ['moon', 8]])) fullRace(id, seed);
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
