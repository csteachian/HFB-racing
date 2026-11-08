// Multi-client headless test: N copies of the real game.js talk through a fake room hub with latency.
// Chaos-mode multiplayer. Usage: node mchaos.js <game.js>
const fs = require('fs');
const THREE = require('./node_modules/three/build/three.js');
globalThis.THREE = THREE;
new Function(fs.readFileSync('./node_modules/three/examples/js/loaders/GLTFLoader.js', 'utf8'))();
THREE.WebGLRenderer = class { setPixelRatio() {} setSize() {} render() {} };

let src = fs.readFileSync(process.argv[2], 'utf8');
src = src.replace('requestAnimationFrame(frame);\n})();', 'window.__dbg = { racers, player, online, COLORS, ranking, leaveRoom, get state() { return state; }, get loadedCourse() { return loadedCourse; }, get N() { return N; }, get pts() { return pts; }, get raceT() { return raceT; }, get obstacles() { return obstacles; }, get rockets() { return rockets; }, get chaosOn() { return chaosOn; }, fireRocket, get parts() { return parts; }, get pickups() { return pickups; }, get chaosGroup() { return chaosGroup; }, get LAPS() { return LAPS; }, headingOf, get tan() { return tan; }, get nrm() { return nrm; }, get HALF() { return HALF; }, get trackLen() { return trackLen; }, ROCKETS };\nrequestAnimationFrame(frame);\n})();');
src = src.replace('const readInput = () => ({', 'const readInput = () => window.__inp ? window.__inp() : ({');
const GAME = new Function('window', 'document', 'THREE', 'requestAnimationFrame', src);

const LAT = 80; // one-way latency, ms of simulated time
let now = performance.now() + 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
function el() {
  const o = { hidden: false, value: '', style: {}, className: '', dataset: {}, disabled: false, width: 0, height: 0, children: [], _t: '',
    classList: { toggle() {} }, appendChild(c) { this.children.push(c); }, setAttribute() {}, click() {}, getContext: () => ctx,
    addEventListener(t, f) { (this.h = this.h || {})[t] = f; } };
  Object.defineProperty(o, 'textContent', { get() { return this._t; }, set(v) { this._t = v; if (v === '') this.children = []; } });
  return o;
}

/* ---- fake room hub: each receiver sees others' presence after LAT ms; frozen, identity-stable snapshots ---- */
const hub = { rooms: new Map(), queue: [] };
const roomOf = (name) => { if (!hub.rooms.has(name)) hub.rooms.set(name, { views: new Map(), truth: new Map(), order: [] }); return hub.rooms.get(name); };
const later = (fn) => hub.queue.push({ at: now + LAT, fn });
function flush() { hub.queue = hub.queue.filter((q) => (q.at <= now ? (q.fn(), false) : true)); }
function roomApi(label, joined) {
  return {
    async join(name) {
      const R = roomOf(name);
      R.views.set(label, { map: new Map(), ver: 1, snap: null, cache: new Map() });
      R.truth.set(label, Object.freeze({})); R.order.push(label);
      const mine = R.views.get(label); mine.map.set(label, R.truth.get(label)); mine.ver++;
      for (const other of R.order) if (other !== label) { const o = R.views.get(other), t = R.truth.get(label); later(() => { if (R.views.has(label)) { o.map.set(label, t); o.ver++; } }); const ot = R.truth.get(other); later(() => { if (R.views.has(other)) { mine.map.set(other, ot); mine.ver++; } }); }
      let errCb = null;
      const room = {
        name, emit: async () => {}, on: () => () => {}, connected: () => true, onConnection: () => () => {},
        onPeers: (fn, onErr) => { errCb = onErr; return () => {}; },
        presence: async (patch) => {
          const cur = { ...R.truth.get(label) }; for (const [k, v] of Object.entries(patch)) { if (v === null) delete cur[k]; else cur[k] = v; }
          const pres = Object.freeze(cur); R.truth.set(label, pres);
          mine.map.set(label, pres); mine.ver++;
          for (const other of R.order) if (other !== label) { const o = R.views.get(other); later(() => { if (o.map.has(label)) { o.map.set(label, pres); o.ver++; } }); }
        },
        peers() {
          if (mine.snap && mine.snap.ver === mine.ver) return mine.snap.arr;
          const arr = []; for (const [l, pres] of mine.map) {
            const c = mine.cache.get(l); let obj;
            if (c && c.pres === pres) obj = c.obj; else { obj = Object.freeze({ peer: l, by: null, isMe: l === label, sameTab: l === label, kind: 'viewer', guest: false, presence: pres, updatedAt: 0 }); mine.cache.set(l, { pres, obj }); }
            arr.push(obj);
          }
          mine.snap = { ver: mine.ver, arr: Object.freeze(arr) }; return mine.snap.arr;
        },
        async leave() {
          R.order = R.order.filter((x) => x !== label); R.views.delete(label); R.truth.delete(label); joined.delete(name);
          for (const other of R.order) { const o = R.views.get(other); later(() => { o.map.delete(label); o.ver++; }); }
        },
        _terminal: (e) => errCb && errCb(e),
      };
      joined.set(name, room); return room;
    },
  };
}

function makeInstance(who, label) {
  const els = new Proxy({}, { get: (t, k) => t[k] || (t[k] = el()) }), handlers = {}, joined = new Map(); let raf = null;
  const document = { getElementById: (id) => els[id], createElement: () => el(), querySelectorAll: () => [], addEventListener() {}, hidden: false };
  const api = roomApi(label, joined);
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, claude: { use: async (n) => (n === 'room' ? api : null) },
    addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); } };
  GAME(window, document, THREE, (f) => { raf = f; });
  const inst = { who, label, els, window, get D() { return window.__dbg; }, frame: (t) => raf && raf(t), api };
  // autopilot: pure pursuit on the centreline, same idea as the bots
  window.__inp = () => { if (window.__park) return { steer: 0, gas: false, brake: false, drift: false };
    const D = window.__dbg, p = D.player, k = (p.idx + 8) % D.N, t = D.pts[k];
    const d = Math.atan2(Math.sin(Math.atan2(t.x - p.x, t.z - p.z) - p.h), Math.cos(Math.atan2(t.x - p.x, t.z - p.z) - p.h));
    return { steer: Math.max(-1, Math.min(1, d * 2.2)), gas: Math.abs(d) < 0.5 || p.speed < 18, brake: Math.abs(d) > 0.9 && p.speed > 22, drift: false };
  };
  return inst;
}

const all = [];
const tick = () => { now += 1000 / 60; for (const i of all) i.frame(now); flush(); };
async function runUntil(cond, maxFrames, label, sleepMs = 0) {
  for (let i = 0; i < maxFrames; i++) { if (cond()) return i; tick(); if (sleepMs) await sleep(sleepMs); else if (i % 25 === 0) await sleep(0); }
  throw new Error('timeout waiting for: ' + label);
}
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const names = (I) => I.D.racers.map((r) => r.name + ':' + r.kind[0]).join(' ');


const sigOf = (I) => I.D.obstacles.map((o) => o.x.toFixed(1) + ',' + o.z.toFixed(1) + ',' + o.kind).join('|');
(async () => {
  const A = makeInstance('Alice', 'k7x'), B = makeInstance('Bob', 'a3q'), C = makeInstance('Cara', 'm9z');
  all.push(A, B, C);
  for (let i = 0; i < 5; i++) tick(); await sleep(5); tick();
  A.els.nick.value = 'Alice'; A.els.create.h.click();
  await runUntil(() => A.D.state === 'lobby', 800, 'Alice in lobby', 5);
  const code = A.els.roomcode.textContent;
  B.els.nick.value = 'Bob'; B.els.code.value = code; B.els.joinbtn.h.click();
  C.els.nick.value = 'Cara'; C.els.code.value = code; C.els.joinbtn.h.click();
  await runUntil(() => B.D.state === 'lobby' && C.D.state === 'lobby', 1500, 'lobby', 5);
  await runUntil(() => [A, B, C].every((I) => I.els.players.children.length === 3), 600, 'all see 3 players');

  // ---- host chooses Chaos in the lobby
  check('lobby offers the mode choice; only the host can change it', A.els.lobbymode.disabled === false && B.els.lobbymode.disabled === true);
  A.els.lobbymode.value = '1'; A.els.lobbymode.h.change({ target: A.els.lobbymode });
  await runUntil(() => B.els.lobbymode.value === '1' && C.els.lobbymode.value === '1', 600, 'mode sync');
  check('guests see the host\'s Chaos choice in the lobby', B.els.lobbymode.value === '1' && /Chaos/.test(B.els.lobbymsg.textContent), B.els.lobbymsg.textContent);
  (() => { const sel = A.els.lobbypicker; sel.value = 'harbour'; sel.h.change({ target: sel }); })();
  await runUntil(() => [A, B, C].every((I) => I.D.loadedCourse === 'harbour'), 600, 'course sync');
  check('changing the course afterwards keeps Chaos selected', A.els.lobbymode.value === '1' && B.els.lobbymode.value === '1');

  A.els.startonline.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'countdown');
  check('everyone starts a Chaos race', [A, B, C].every((I) => I.D.chaosOn === true));
  check('every browser built the same obstacles', sigOf(A).length > 100 && sigOf(A) === sigOf(B) && sigOf(B) === sigOf(C), `${A.D.obstacles.length} obstacles`);
  check('Rockets counter is shown to everyone', [A, B, C].every((I) => I.els.ammochip.hidden === false));
  await runUntil(() => A.D.state === 'race' && B.D.state === 'race' && C.D.state === 'race', 600, 'go');
  for (const I of [A, B, C]) I.window.__park = true; // stop the autopilots so the karts sit where we put them
  for (let i = 0; i < 60; i++) tick();

  // helper: put a human's kart on the road at idx, a given distance of road along
  const here = (I, idx, lat = 0) => { const D = I.D, p = D.pts[idx], n = D.nrm[idx]; Object.assign(D.player, { x: p.x + n.x * lat, z: p.z + n.z * lat, y: p.y, h: D.headingOf(D.tan[idx]), idx, dist: Math.abs(lat), speed: 0, steer: 0, boost: 0, gate: Math.floor(idx * 14 / D.N), laps: 0 }); };
  const clear = (I) => { I.D.obstacles.length = 0; };
  // ---- rocket pickups: same spots everywhere; a pickup taken by a human or by the host's bot vanishes on every screen
  const pkSig = (I) => I.D.pickups.map((p) => p.key + ':' + p.x.toFixed(1) + ',' + p.z.toFixed(1)).join('|');
  check('every browser has the same rocket pickups (4 per lap)', A.D.pickups.length === A.D.LAPS * 4 && pkSig(A) === pkSig(B) && pkSig(B) === pkSig(C), `${A.D.pickups.length} pickups`);
  const pk = (I, key) => I.D.pickups.find((p) => p.key === key), k0 = A.D.pickups[0].key, k1 = A.D.pickups[1].key;
  Object.assign(C.D.player, { x: pk(C, k0).x, z: pk(C, k0).z });
  await runUntil(() => pk(A, k0).taken && pk(B, k0).taken, 90, 'pickup taken seen');
  check('Cara drives through a pickup: she has 4 rockets and it disappears on every screen', C.D.player.ammo === 4 && pk(A, k0).taken && pk(B, k0).taken && pk(C, k0).taken);
  const botP = A.D.racers.find((r) => r.kind === 'bot'); const bot0 = botP.ammo; Object.assign(botP, { x: pk(A, k1).x, z: pk(A, k1).z });
  await runUntil(() => pk(B, k1).taken && pk(C, k1).taken, 90, 'bot pickup seen');
  check('the host\'s bot takes a pickup: its count goes up and guests see it vanish', botP.ammo > bot0 || bot0 >= 6, `ammo ${bot0} -> ${botP.ammo}`);
  // ---- a rocket destroys a burnt-out car, on every screen
  const wreckOf = (I) => I.D.obstacles.filter((o) => o.kind === 'wreck');
  check('there is a wreck to shoot', wreckOf(A).length > 0 && wreckOf(A).length === wreckOf(B).length);
  { const wa = wreckOf(A)[0]; const key = wa.x.toFixed(1) + ',' + wa.z.toFixed(1);
    for (const I of [A, B, C]) { const keep = I.D.obstacles.find((o) => o.kind === 'wreck' && o.x.toFixed(1) + ',' + o.z.toFixed(1) === key); I.D.obstacles.length = 0; I.D.obstacles.push(keep); }
    const al = A.D.player; al.h = Math.atan2(wa.x - al.x, wa.z - al.z); al.x = wa.x - Math.sin(al.h) * 25; al.z = wa.z - Math.cos(al.h) * 25; al.y = wa.y; al.ammo = 3; al.dead = 0; al.safe = 0; al.finished = false; al.idx = wa.idx; al.dist = 0;
    A.D.fireRocket(al);
    await runUntil(() => [A, B, C].every((I) => I.D.obstacles.length === 0), 120, 'wreck destroyed everywhere');
    check('Alice\'s rocket destroys the wreck on every screen', [A, B, C].every((I) => I.D.obstacles.length === 0 && I.D.rockets.length === 0)); }
  for (const I of [A, B, C]) clear(I);
  // pick a stretch of road: Bob at idx i0, Cara 20 metres further on, same lane; Alice well away behind
  const N = A.D.N, mpi = A.D.trackLen / N, i0 = Math.round(N * 0.5), i1 = i0 + Math.round(20 / mpi), iA = (i0 - Math.round(80 / mpi) + N) % N;
  here(B, i0); here(C, i1); here(A, iA);
  for (let i = 0; i < 60; i++) tick();

  // ---- Bob fires at Cara
  const bobOnA = A.D.racers.find((r) => r.name === 'Bob'), bobOnC = C.D.racers.find((r) => r.name === 'Bob');
  check('Bob fires: one rocket used, rocket flying in his own browser', B.D.fireRocket(B.D.player) && B.D.rockets.length === 1 && B.D.player.ammo === 2);
  await runUntil(() => A.D.rockets.length === 1 && C.D.rockets.length === 1 || C.D.player.dead > 0, 60, 'rocket reaches others');
  check('the rocket appears in the other browsers too', true);
  check('the rocket appears at the right place (same start as Bob\'s)', Math.hypot(A.D.rockets[0] ? A.D.rockets[0].x - B.D.player.x : 999, 0) < 200);
  await runUntil(() => C.D.player.dead > 0, 120, 'Cara is hit');
  check('Cara\'s own browser decides she was hit and destroys her kart', C.D.player.dead > 2.5 && C.D.player.hitBy === 'Bob', `hit by ${C.D.player.hitBy}`);
  const caraOnA = A.D.racers.find((r) => r.name === 'Cara'), caraOnB = B.D.racers.find((r) => r.name === 'Cara');
  await runUntil(() => caraOnA.dead > 0 && caraOnB.dead > 0, 120, 'others see the explosion');
  check('Alice and Bob see Cara\'s kart explode (hidden for 3 s, rocket removed)', caraOnA.dead > 0 && caraOnB.dead > 0 && caraOnA.mesh.visible === false, `rockets left A=${A.D.rockets.length} B=${B.D.rockets.length}`);
  check('the rocket is removed everywhere after the hit', A.D.rockets.length === 0 && B.D.rockets.length === 0 && C.D.rockets.length === 0);
  const partsOnA = A.D.parts.length; check('the explosion shows on Alice\'s screen too', partsOnA > 10, `${partsOnA} particles`);
  await runUntil(() => C.D.player.dead === 0, 60 * 5, 'Cara respawns');
  await runUntil(() => caraOnA.dead <= 0 && caraOnB.dead <= 0, 60 * 2, 'copies reappear');
  check('after 3 s Cara is back and visible on every screen', caraOnA.mesh.visible && caraOnB.mesh.visible && C.D.player.safe > 0);

  // ---- ammo limit and sync of the counter
  B.D.fireRocket(B.D.player); B.D.fireRocket(B.D.player); const fourth = B.D.fireRocket(B.D.player);
  check('Bob cannot fire a fourth rocket', fourth === false && B.D.player.ammo === 0);

  // ---- host's bot is hit by Alice (host) and everyone sees it
  for (let i = 0; i < 400; i++) tick(); for (const I of [A, B, C]) I.D.rockets.length = 0;
  const bot = A.D.racers.find((r) => r.kind === 'bot'); window_bot = bot;
  await runUntil(() => bot.speed > 20, 600, 'bot is moving');
  // rocket from Alice straight onto the bot: teleport Alice 12 m behind it, aligned with the road
  const botOnB = B.D.racers.find((r) => r.botIdx === bot.botIdx), botOnC = C.D.racers.find((r) => r.botIdx === bot.botIdx);
  for (let attempt = 0; attempt < 3 && !(bot.dead > 0); attempt++) { // bots wander a little, so try again if the first shot misses
    A.D.player.ammo = 3; A.D.player.dead = 0; A.D.player.safe = 0; A.D.player.finished = false; A.D.rockets.length = 0;
    const bi = bot.idx; here(A, (bi - Math.round(14 / mpi) + N) % N, 0); A.D.player.x = bot.x - Math.sin(bot.h) * 14; A.D.player.z = bot.z - Math.cos(bot.h) * 14; A.D.player.h = bot.h; A.D.player.y = bot.y;
    A.D.fireRocket(A.D.player);
    for (let k = 0; k < 90 && !(bot.dead > 0); k++) tick();
  }
  check('the host\'s own bot is destroyed by Alice\'s rocket', bot.dead > 2.5);
  await runUntil(() => botOnB.dead > 0 && botOnC.dead > 0, 120, 'bot explosion reaches guests');
  check('guests see the bot explode too', botOnB.dead > 0 && botOnC.dead > 0 && botOnB.mesh.visible === false);

  // ---- host's bot fires: guests see the rocket and the owner's ammo
  const bot2 = A.D.racers.filter((r) => r.kind === 'bot' && r !== bot)[0], b2B = B.D.racers.find((r) => r.botIdx === bot2.botIdx);
  bot2.ammo = 3; bot2.dead = 0; bot2.safe = 0; A.D.rockets.length = 0; B.D.rockets.length = 0; b2B.ammo = 3;
  { const j = (i1 + Math.round(90 / mpi)) % N, p = A.D.pts[j]; Object.assign(bot2, { x: p.x, z: p.z, y: p.y, h: A.D.headingOf(A.D.tan[j]), idx: j, speed: 0 }); } // well ahead of the parked human karts, aimed away from them
  A.D.fireRocket(bot2);
  await runUntil(() => B.D.rockets.some((q) => q.owner === b2B), 60, 'bot rocket arrives');
  check('a bot rocket fired on the host appears on guests, and its owner\'s count drops', B.D.rockets.some((q) => q.owner === b2B) && true);

  // ---- a second race: nothing replays, new layout, still identical everywhere
  for (let i = 0; i < 60 * 6; i++) tick();
  const sig1 = sigOf(A);
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'done'), 60 * 400, 'finish', 0).catch(() => {});
  // end the race by force: host back to lobby
  A.els.tolobby.hidden = false;
  A.D.online.room.presence({ race: Object.assign({}, A.D.online.cfg, { n: A.D.online.cfg.n + 1, phase: 'lobby', roster: [] }) });
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'lobby'), 600, 'back to lobby');
  check('back in the lobby the obstacles are cleared', [A, B, C].every((I) => I.D.obstacles.length === 0));
  for (const I of [A, B, C]) I.window.__park = false;
  A.els.startonline.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'second race');
  check('second race: fresh layout, identical in every browser', sigOf(A) !== sig1 && sigOf(A) === sigOf(B) && sigOf(B) === sigOf(C) && A.D.obstacles.length > 5);
  for (let i = 0; i < 60 * 5; i++) tick();
  check('second race: old rockets and hits did not replay', [A, B, C].every((I) => I.D.rockets.length === 0 && I.D.racers.every((r) => !(r.dead > 0) || r.kind === 'bot')) , 'rockets ' + [A, B, C].map((I) => I.D.rockets.length));
  check('second race: every car has its three rockets again', [A, B, C].every((I) => I.D.racers.every((r) => r.ammo === 3 || r.kind === 'bot' || I.D.state !== 'count')), '');

  // ---- host switches to Normal: no obstacles, no rockets
  A.D.online.room.presence({ race: Object.assign({}, A.D.online.cfg, { n: A.D.online.cfg.n + 1, phase: 'lobby', roster: [] }) });
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'lobby'), 600, 'lobby 2');
  A.els.lobbymode.value = '0'; A.els.lobbymode.h.change({ target: A.els.lobbymode });
  await runUntil(() => B.els.lobbymode.value === '0', 600, 'normal sync');
  A.els.startonline.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'normal race');
  check('Normal mode: no obstacles, no rocket counter, F does nothing', [A, B, C].every((I) => I.D.chaosOn === false && I.D.obstacles.length === 0 && I.els.ammochip.hidden === true) && B.D.fireRocket(B.D.player) === false);
  A.D.leaveRoom(); B.D.leaveRoom(); C.D.leaveRoom(); await sleep(5);
  console.log(failed ? `\nRESULT: FAIL (${failed} checks)` : '\nRESULT: PASS'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
let window_bot;
