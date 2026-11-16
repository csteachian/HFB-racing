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
src = src.replace('requestAnimationFrame(frame);\n})();', 'globalThis.__dbg = { racers, player, get N() { return N; }, get HALF() { return HALF; }, get state() { return state; }, get pts() { return pts; }, get tan() { return tan; }, get nrm() { return nrm; }, get pads() { return pads; }, get raceT() { return raceT; }, selectCourse, COURSES, step, VERSION, get LAPS() { return LAPS; }, get trackLen() { return trackLen; }, get lostT() { return lostT; }, get lostWhy() { return lostWhy; }, get obstacles() { return obstacles; }, get rockets() { return rockets; }, get parts() { return parts; }, get chaosOn() { return chaosOn; }, set chaosOn(v) { chaosOn = v; }, set chaosSeed(v) { chaosSeed = v; }, get shake() { return shake; }, buildObstacles, clearChaos, fireRocket, spawnRocket, startRace, hitObstacles, respawnAfterBlast, botInput, respawnKey, get camH() { return camH; }, ROCKETS, ROCKET_SPEED, BLAST_SECS, SAFE_SECS, ROCKET_OFF_SECS, headingOf, get chaosGroup() { return chaosGroup; }, get pickups() { return pickups; }, collectPickups, MAX_CARRY, PICKUPS_PER_LAP, destroyWreck, get camera() { return camera; }, get outbox() { return outbox; }, get ammoText() { return els.ammo; }, bump, get gateObjs() { return gateObjs; }, get rec() { return rec; }, tyreCheck, set tyreRand(v) { tyreRand = v; }, blowUp, loadRec, setShape, SKILLS, BOT_POOL, gateIdx, restartRace, crossTime, get gateOf() { return player.gate; }, pickNames, assignBotSkills, baseLane, lateral };\nrequestAnimationFrame(frame);\n})();');
src = src.replace('const readInput = () => ({', 'const readInput = () => globalThis.__inp ? globalThis.__inp() : ({');
new Function(src)();
globalThis.__store = {}; globalThis.localStorage = { getItem: (k) => (k in __store ? __store[k] : null), setItem: (k, v) => { __store[k] = String(v); }, removeItem: (k) => { delete __store[k]; } };
const D = globalThis.__dbg, P = D.player;
let now = 0; const tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; raf(now); } };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let ok = true; const check = (c, msg) => { console.log((c ? 'PASS  ' : 'FAIL  ') + msg); if (!c) ok = false; };
const still = () => ({ steer: 0, gas: false, brake: false, drift: false });
const ids = D.COURSES.map((c) => c.id), sig = () => D.obstacles.map((o) => [o.x.toFixed(2), o.z.toFixed(2), o.kind].join()).join('|');
const mpi = () => D.trackLen / D.N;


// ================================================================= five fixes: wrong way, levels, names, finish line, restart
const key = (code) => { const e = { code, target: {}, repeat: false, preventDefault() { e.pd = true; } }; (handlers.keydown || []).forEach((f) => f(e)); return e; };
const begin = () => { D.chaosOn = false; D.selectCourse('kerb'); tick(2); D.startRace(); tick(60 * 3 + 40); };
const place = (r, i, off = 0) => { const p = D.pts[i % D.N], n = D.nrm[i % D.N], t = D.tan[i % D.N]; Object.assign(r, { x: p.x + n.x * off, z: p.z + n.z * off, speed: 25, heading: D.headingOf(t), idx: i % D.N }); };
console.log('--- wrong way');
{ begin(); tick(60 * 4);
  const gi = D.gateIdx(P.gate), before = P.gate; // drive back through the last checkpoint passed: a few gates' worth of track backwards
  place(P, (gi - Math.ceil(40 / mpi()) + D.N) % D.N); tick(20);
  const shown = els.warn.hidden === false && D.lostWhy === 'WRONG WAY';
  tick(60 * 1.2);
  const back = Math.abs(((P.idx - D.gateIdx(before) + D.N * 1.5) % D.N) - D.N / 2) < 6 && els.warn.hidden === true && P.gate === before;
  check(shown && back, `driving back past the last checkpoint: message "WRONG WAY" = ${shown}, put back on the last checkpoint = ${back}`);
  // a spin or a short reverse just behind the line is NOT punished
  place(P, D.gateIdx(P.gate) - 1 + D.N); tick(30);
  check(els.warn.hidden === true, 'a short reverse just behind the checkpoint is not punished');
  // round the whole lap the right way: gates still count and laps still increase
  const L0 = P.laps; place(P, 4); P.gate = 0; for (let g = 1; g < 14; g++) { place(P, D.gateIdx(g)); tick(3); }
  check(P.gate >= 12, `driving the right way still advances checkpoints (gate ${P.gate})`);
}
console.log('--- finish line is the same for players and bots');
{ begin(); const bot = D.racers[1]; P.laps = 2; P.gate = 13; bot.laps = 2; bot.finished = false; P.finished = false;
  const m = mpi(), t0 = D.raceT;
  place(bot, D.N - Math.ceil(30 / m)); bot.speed = 30; place(P, D.N - Math.ceil(40 / m)); P.speed = 30; // bot is 10 m in front of the player
  // 1: a player 2 points short of the line gets nothing, a bot 2 points short gets nothing
  place(P, D.N - 2); P.speed = 0; bot.speed = 0; place(bot, D.N - 2); tick(1);
  check(!P.finished && !bot.finished && P.laps === 2 && bot.laps === 2, 'neither kart is credited before reaching the line');
  // 2: bot ahead of player at the line records the earlier time
  place(bot, D.N - Math.ceil(12 / m)); bot.speed = 30; place(P, D.N - Math.ceil(22 / m)); P.speed = 30;
  let f = 0; while ((!P.finished || !bot.finished) && f++ < 600) { P.speed = Math.max(P.speed, 30); tick(1); }
  check(P.finished && bot.finished && bot.finishT < P.finishT, `the bot 10 m in front of the player finishes first (${bot.finishT.toFixed(2)} s vs ${P.finishT.toFixed(2)} s)`);
  // 3: the reverse: player ahead finishes first
  begin(); P.laps = 2; P.gate = 13; const b2 = D.racers[2]; b2.laps = 2;
  place(P, D.N - Math.ceil(12 / m)); P.speed = 30; place(b2, D.N - Math.ceil(22 / m)); b2.speed = 30; f = 0;
  while ((!P.finished || !b2.finished) && f++ < 600) { P.speed = Math.max(P.speed, 30); b2.speed = Math.max(b2.speed, 30); tick(1); }
  check(P.finished && P.finishT < b2.finishT, `the player 10 m in front of a bot finishes first (${P.finishT.toFixed(2)} s vs ${b2.finishT.toFixed(2)} s)`);
}
console.log('--- skill levels and names');
{ const seen = new Set(), names = new Set(); let ok3 = true, uniq = true, mixes = 0, difff = false;
  for (let n = 0; n < 40; n++) { D.startRace(); const bots = D.racers.filter((r) => r.kind === 'bot'); const sk = bots.map((r) => r.skill);
    for (const k of sk) seen.add(k); if (new Set(sk).size === 3) mixes++; if (!sk.every((k) => k >= 1 && k <= 3)) ok3 = false;
    const nm = D.racers.map((r) => r.name); if (new Set(nm).size !== nm.length) uniq = false; nm.slice(1).forEach((x) => names.add(x));
    for (const r of bots) { const s = D.SKILLS[r.skill]; if (r.base < s.base[0] - 1e-9 || r.base > s.base[1] + 1e-9) ok3 = false; }
    if (n > 0 && sk.join() !== prev) difff = true; var prev = sk.join(); }
  check(ok3 && seen.size === 3 && mixes === 40 && difff, `three levels dealt randomly: all of Easy/Medium/Hard appear in every race (${mixes}/40), order changes between races ${difff}`);
  check(D.BOT_POOL.length >= 40 && new Set(D.BOT_POOL).size === D.BOT_POOL.length && uniq && names.size >= 25, `name pool of ${D.BOT_POOL.length}: no duplicates in a race, ${names.size} different opponent names seen over 40 races`);
}
console.log('--- harder bots really are faster, take a better line and block');
{ const lapTimes = {}; D.chaosOn = false;
  for (const lvl of [1, 2, 3]) { D.selectCourse('kerb'); tick(2); D.startRace(); D.racers.forEach((r, i) => { if (r.kind === 'bot') { r.skill = i === 1 ? lvl : 1; const s = D.SKILLS[r.skill]; r.base = (s.base[0] + s.base[1]) / 2; } });
    // park the player far behind so catch-up does not interfere, no input
    globalThis.__inp = () => ({ steer: 0, gas: false, brake: false, drift: false }); tick(60 * 3 + 40); const b = D.racers[1]; let f = 0; while (b.laps < 1 && f++ < 60 * 120) tick(1); lapTimes[lvl] = D.raceT; globalThis.__inp = null; }
  check(lapTimes[3] < lapTimes[2] && lapTimes[2] < lapTimes[1], `lap time falls with level: Easy ${lapTimes[1].toFixed(1)} s, Medium ${lapTimes[2].toFixed(1)} s, Hard ${lapTimes[3].toFixed(1)} s`);
  // blocking: a Hard bot just ahead moves across to the side the human is on; an Easy one does not
  D.selectCourse('kerb'); tick(2); D.startRace(); tick(60 * 3 + 40); tick(60 * 3);
  const res = {}; for (const lvl of [1, 3]) { const b = D.racers[1]; b.skill = lvl; place(b, 120, -1); b.lane = 0; place(P, 120 - Math.ceil(10 / mpi()), 4); P.speed = b.speed = 30; res[lvl] = D.baseLane(b); }
  check(res[3] > 1.5 && res[3] > res[1] + 1.5, `Hard bot steers to the player's side (lane ${res[3].toFixed(1)} m) while an Easy bot keeps its own (${res[1].toFixed(1)} m)`);
}
console.log('--- restart key');
{ begin(); tick(60 * 6); const t = D.raceT, ge = P.gate; P.speed = 30;
  const e = key('Backspace');
  check(e.pd === true && D.state === 'count' && D.raceT <= 0.01 + 0 && P.laps === -1 + 0 || (D.state === 'count' && P.speed === 0), `Backspace restarts the race (state ${D.state}, speed ${P.speed}, prevented browser back = ${e.pd})`);
  tick(60 * 3 + 40); tick(60 * 2); check(D.state === 'race' && D.raceT > 0.5 && D.raceT < t, `and the new race runs (race time ${D.raceT.toFixed(1)} s, was ${t.toFixed(1)} s)`);
  els.restart.h.click({ currentTarget: { blur() {} } }); check(D.state === 'count', 'the on-screen Restart button does the same');
}
console.log('--- restart keeps opponents; new race changes them; cars');
{ begin(); const snap = () => D.racers.map((r) => r.name + ':' + r.skill + ':' + r.shape + ':' + r.base.toFixed(4)).join('|'); const a = snap(); tick(60 * 5); key('Backspace'); const b = snap();
  check(a === b, 'Backspace restart keeps every opponent name, level, speed and car');
  D.startRace(); const c = snap(); check(c !== a, 'a brand new race deals new opponents');
  let shapes = new Set(), distinct = true; for (let n = 0; n < 30; n++) { D.startRace(); const sh = D.racers.slice(1).map((r) => r.shape); sh.forEach((x) => shapes.add(x)); if (new Set(sh).size !== 5) distinct = false; }
  check(shapes.size === 5 && distinct, 'all five car shapes appear, the five bots always have different ones');
  els.carsel.blur = () => {}; els.carsel.value = '3'; (els.carsel.h.change || (() => {}))({}); check(P.shape === 3 && D.racers[0].body.children.length > 0, 'choosing a car in the menu changes the player\'s car');
  D.startRace(); check(P.shape === 3, 'and it stays chosen for the next race');
}
console.log('--- checkpoint gates, bumping, records');
{ begin(); const g = D.gateObjs.filter(Boolean);
  check(g.length === 13, `${g.length} checkpoint gates drawn (neon line + two flags each)`);
  P.gate = 2; tick(2); const lit = g.filter((o) => o.mat.color.g > 0.9 && o.mat.color.r > 0.4).length; check(lit === 1, 'exactly one gate, the next, is lit green');
  // rear-end ram: kart a behind b, a faster
  const mk = (x, sp) => ({ x, z: 0, h: 0, speed: sp, steer: 0 }); // heading 0 = +z
  { const a = { x: 0, z: 0, h: 0, speed: 35, steer: 0 }, b = { x: 0, z: 2.2, h: 0, speed: 20, steer: 0 }; D.bump(a, b, 0, 1, 1, 1);
    check(a.speed < 35 - 8 && b.speed > 20 + 8 && Math.abs(a.h) < 1e-6 && Math.abs(b.h) < 1e-6, `rear-end ram: rammer 35 -> ${a.speed.toFixed(1)}, car in front 20 -> ${b.speed.toFixed(1)}, both keep straight`); }
  { const a = { x: 0, z: 0, h: 0.3, speed: 30, steer: 0.5 }, b = { x: 1.4, z: 1.2, h: 0, speed: 30, steer: 0 }; const d = Math.hypot(1.4, 1.2); D.bump(a, b, 1.4 / d, 1.2 / d, 1, 1);
    check(Math.abs(a.h - 0.3) > 0.02 && Math.abs(b.h) > 0.005 && Math.abs(a.yaw) > 0.05, `side swipe turns both karts (headings ${a.h.toFixed(2)}, ${b.h.toFixed(2)}) and wobbles the one that was hit`); }
  { const a = { x: 0, z: 0, h: 0, speed: 30, steer: 0 }, b = { x: 0, z: 2.2, h: Math.PI, speed: 30, steer: 0 }; D.bump(a, b, 0, 1, 1, 1);
    check(a.speed < 0 && b.speed < 0, `head-on: both bounce back (${a.speed.toFixed(1)}, ${b.speed.toFixed(1)})`); }
  { const a = { x: 0, z: 0, h: 0, speed: 20, steer: 0 }, b = { x: 0, z: 2.2, h: 0, speed: 30, steer: 0 }; D.bump(a, b, 0, 1, 1, 1);
    check(a.speed === 20 * 0.995 && b.speed === 30 * 0.995, 'a faster kart pulling away is not slowed by the one behind'); }
  // records
  begin(); try { localStorage.removeItem('x'); } catch (e) {}
  const had0 = D.rec.lap; for (let k = 0; k <= 14; k++) { place(P, D.gateIdx(k % 14) + 1); P.speed = 25; tick(3); }
  check(D.rec.lap > 0, `a completed lap is recorded (${D.rec.lap.toFixed(2)} s)`);
  const stored = JSON.parse(localStorage.getItem(Object.keys(globalThis.__store || {}).find((k) => k.startsWith('hfbracing-rec:kerb')) || 'none') || 'null');
  check(stored && Math.abs(stored.lap - D.rec.lap) < 1e-6, 'and saved in the browser under the course name');
  const keep = D.rec.lap; D.startRace(); check(Math.abs(D.loadRec(false).lap - keep) < 1e-6 && els.best.textContent !== '--', `next race starts with the record on the HUD (${els.best.textContent})`);
  els.tomenu.h.click(); tick(3); D.selectCourse('harbour'); tick(2); check(D.loadRec(false).lap === 0, 'a different course has its own (empty) record'); D.selectCourse('kerb'); tick(2);
}
console.log('--- tyre wear');
{ begin(); tick(60); const off = () => { const i = P.idx, n = D.nrm[i], p = D.pts[i]; Object.assign(P, { x: p.x + n.x * (D.HALF + 4), z: p.z + n.z * (D.HALF + 4), speed: 30 }); };
  check(P.tyre === 100 && els.tyres.textContent === '0%', 'a race starts on 100% tyres (0% damage)');
  let msgs = []; const tyreRandKeep = Math.random; D.tyreRand = () => 1; // no bursts yet
  for (let f = 0; f < 60 * 2; f++) { off(); P.dist = D.HALF + 4; D.tyreCheck(P, 1 / 60); if (f % 20 === 0) { tick(1); msgs.push(els.tiret.textContent + (els.tire.hidden ? ' (hidden)' : '')); } }
  check(P.tyre < 100 && P.tyre > 70 && msgs.some((m) => /TIRE DAMAGE \d+%$/.test(m)), `leaving the road wears tyres (${P.tyre.toFixed(1)}% left after 2 s) and shows: ${msgs.slice(-2).join(' | ')}`);
  const on = P.tyre; P.dist = 0; for (let f = 0; f < 60; f++) D.tyreCheck(P, 1 / 60); check(P.tyre === on, 'driving on the road does not wear them');
  let last = ''; for (let f = 0; f < 60 * 12; f++) { P.dist = D.HALF + 4; P.speed = 30; D.tyreCheck(P, 1 / 60); if (f % 30 === 0) { tick(1); P.dist = D.HALF + 4; } }
  check(P.tyre <= 10 && P.dead === 0, `worn down to ${P.tyre.toFixed(1)}%: not exploded while the dice say no`);
  tick(1); check(els.tiret.textContent === 'TIRE DAMAGE ' + Math.round(100 - P.tyre) + '%' && els.tire.hidden === false, 'banner shows the high damage: ' + els.tiret.textContent);
  D.tyreRand = () => 0; P.speed = 30; D.tyreCheck(P, 1 / 60); check(P.dead > 2.5 && P.tyreBlow === true, `at 10% or less a burst explodes the car (out for ${P.dead.toFixed(1)} s)`);
  tick(2); check(els.boom.hidden === false && /Tyre burst/.test(els.boomt.textContent), 'on-screen message: ' + els.boomt.textContent);
  tick(60 * 3); check(P.dead === 0 && P.tyre === 100, `respawned on the road with fresh tyres (${P.tyre}%)`);
  // bots wear too, and a healthy kart never bursts
  const b = D.racers[1]; b.tyre = 50; b.speed = 30; D.tyreRand = () => 0; D.tyreCheck(b, 1); check(b.dead === 0, 'a kart with 50% tyres never bursts');
  Object.assign(b, { tyre: 4, speed: 30, dist: 0, safe: 0 }); D.tyreCheck(b, 1 / 60); check(b.dead > 0, 'a bot with worn tyres can burst too');
  D.tyreRand = Math.random;
}
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
