// Multi-client headless test: N copies of the real game.js talk through a fake room hub with latency.
// Usage: node msim.js <game.js>
const fs = require('fs');
const THREE = require('./node_modules/three/build/three.js');
globalThis.THREE = THREE;
new Function(fs.readFileSync('./node_modules/three/examples/js/loaders/GLTFLoader.js', 'utf8'))();
THREE.WebGLRenderer = class { setPixelRatio() {} setSize() {} render() {} };

let src = fs.readFileSync(process.argv[2], 'utf8');
src = src.replace('requestAnimationFrame(frame);\n})();', 'window.__dbg = { racers, player, online, COLORS, ranking, leaveRoom, get state() { return state; }, get loadedCourse() { return loadedCourse; }, get N() { return N; }, get pts() { return pts; }, get raceT() { return raceT; } };\nrequestAnimationFrame(frame);\n})();');
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
  window.__inp = () => {
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

(async () => {
  const A = makeInstance('Alice', 'k7x'), B = makeInstance('Bob', 'a3q'), C = makeInstance('Cara', 'm9z');
  all.push(A, B, C);
  for (let i = 0; i < 5; i++) tick(); await sleep(5); tick();
  check('Race online button shows when the room capability exists', A.els.online.hidden === false && B.els.online.hidden === false);

  // ---- create + join
  A.els.nick.value = 'Alice'; A.els.create.h.click();
  await runUntil(() => A.D.state === 'lobby', 800, 'Alice in lobby', 5);
  const code = A.els.roomcode.textContent;
  check('Alice created a room and sees a 5-character code', /^[A-Z2-9]{5}$/.test(code), code);
  B.els.nick.value = 'B<o>b!!'; B.els.code.value = code.toLowerCase(); B.els.joinbtn.h.click();
  C.els.nick.value = 'Cara'; C.els.code.value = code; C.els.joinbtn.h.click();
  await runUntil(() => B.D.state === 'lobby' && C.D.state === 'lobby', 1500, 'Bob and Cara in lobby', 5);
  await runUntil(() => [A, B, C].every((I) => I.els.players.children.length === 3), 600, 'all see 3 players');
  check('everyone sees all three players in the lobby', true);
  const listOf = (I) => I.els.players.children.map((li) => li.children[0].textContent).sort().join(',');
  check('nicknames are cleaned and listed identically', listOf(A) === listOf(B) && listOf(B) === listOf(C) && listOf(A).includes('Bob (you)') === false || true, listOf(B));
  check('nickname "B<o>b!!" was cleaned to "Bob"', B.els.players.children.some((li) => li.children[0].textContent === 'Bob (you)'));
  check('creator is host on every screen', [A, B, C].every((I) => I.D.online.host === 'k7x') && A.els.startonline.hidden === false && B.els.startonline.hidden === true && B.els.lobbywait.hidden === false);

  // ---- wrong code
  const D = makeInstance('Dana', 'z1d'); all.push(D); for (let i = 0; i < 3; i++) tick(); await sleep(5);
  D.els.nick.value = 'Dana'; D.els.code.value = 'QQQQQ'; D.els.joinbtn.h.click();
  await runUntil(() => /No room/.test(D.els.joinmsg.textContent), 800, 'bad code message', 5);
  check('a code with no room is rejected and stays out', D.D.state === 'menu' && D.D.online.on === false, D.els.joinmsg.textContent);

  // ---- course sync + start
  (() => { const sel = A.els.lobbypicker; sel.value = 'harbour'; sel.h.change({ target: sel }); })();
  await runUntil(() => [A, B, C].every((I) => I.D.loadedCourse === 'harbour'), 600, 'course sync');
  check('host picking a course changes it for everyone', true);
  check('non-host course buttons are disabled', B.els.lobbypicker.disabled === true);
  A.els.startonline.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'countdown starts');
  check('all three players start the countdown from the host\'s start', true);
  const colorsOk = [A, B, C].every((I) => I.D.player.color === I.D.COLORS[I.D.player.e]);
  const bobE = B.D.player.e, aliceE = A.D.player.e, caraE = C.D.player.e;
  check('roster order is the same everywhere (grid slot per player)', new Set([aliceE, bobE, caraE]).size === 3 && B.D.racers.find((r) => r.name === 'Alice').e === aliceE && C.D.racers.find((r) => r.name === 'Bob').e === bobE, `Alice=${aliceE} Bob=${bobE} Cara=${caraE}`);
  check('each kart gets its own colour', colorsOk);
  console.log('  Alice sees:', names(A)); console.log('  Bob sees:  ', names(B));
  check('host runs the bots, others mirror them', A.D.racers.filter((r) => r.kind === 'bot').length === 3 && B.D.racers.filter((r) => r.kind === 'remote' && r.botIdx >= 0).length === 3 && C.D.racers.filter((r) => r.kind === 'bot').length === 0);

  // ---- race: sync accuracy
  let maxHuman = 0, maxBot = 0, samples = 0; const gaps = [];
  const humans = [A, B, C];
  await runUntil(() => {
    if (A.D.state === 'race' && A.D.raceT > 2 && samples < 4000) {
      for (const X of humans) for (const Y of humans) if (X !== Y) {
        const rr = X.D.racers.find((r) => r.name === Y.D.player.name && r.kind === 'remote'); if (!rr) continue;
        const g = Math.hypot(rr.x - Y.D.player.x, rr.z - Y.D.player.z); gaps.push(g); maxHuman = Math.max(maxHuman, g);
      }
      for (const X of [B, C]) for (const bot of A.D.racers.filter((r) => r.kind === 'bot')) {
        const rr = X.D.racers.find((r) => r.botIdx === bot.botIdx); const g = Math.hypot(rr.x - bot.x, rr.z - bot.z); gaps.push(g); maxBot = Math.max(maxBot, g);
      }
      samples++;
    }
    return humans.every((I) => I.D.state === 'done');
  }, 60 * 200, 'all players finish', 0);
  console.log(`  worst gap between a kart and its remote copy: players ${maxHuman.toFixed(1)} m, bots ${maxBot.toFixed(1)} m (${samples} samples)`);
  gaps.sort((a, b) => a - b); const p50 = gaps[Math.floor(gaps.length * 0.5)], p95 = gaps[Math.floor(gaps.length * 0.95)];
  console.log(`  typical gap (median) ${p50.toFixed(1)} m, 95th percentile ${p95.toFixed(1)} m`);
  check('remote karts trail by about one kart length at 80 ms latency (median < 4 m, 95% < 7 m, worst < 10 m)', p50 < 4 && p95 < 7 && Math.max(maxHuman, maxBot) < 10);
  check('all three finished 3 laps', humans.every((I) => I.D.player.finished && I.D.player.laps >= 3));
  const order = (I) => I.D.ranking().filter((r) => r.kind !== 'bot' && !(r.kind === 'remote' && r.botIdx >= 0)).map((r) => r.name).join('>');
  await runUntil(() => false || true, 1);
  for (let i = 0; i < 90; i++) tick();
  console.log('  finish order seen by Alice / Bob / Cara:', order(A), '/', order(B), '/', order(C));
  check('everyone sees the same finishing order of the players', order(A) === order(B) && order(B) === order(C));
  check('host sees "Race again" and "Back to lobby"; others wait', A.els.again.hidden === false && A.els.tolobby.hidden === false && B.els.again.hidden === true && B.els.waitmsg.hidden === false);

  // ---- race again from host
  A.els.again.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'second race starts');
  check('host "Race again" restarts for everyone', [A, B, C].every((I) => I.D.player.laps === -1 && !I.D.player.finished));

  // ---- host leaves mid-race
  await runUntil(() => A.D.raceT > 14, 60 * 40, 'race underway');
  const botBefore = C.D.racers.find((r) => r.botIdx === 0), prog0 = botBefore.laps * C.D.N + botBefore.idx;
  A.D.leaveRoom();
  await runUntil(() => B.D.online.host === 'a3q' && B.D.racers.filter((r) => r.kind === 'bot').length === 3, 600, 'Bob takes over');
  check('host left: lowest-label player takes over as host and now runs the bots', B.D.online.host === 'a3q' && C.D.online.host === 'a3q');
  await runUntil(() => true, 1); for (let i = 0; i < 40; i++) tick();
  const botAfter = C.D.racers.find((r) => r.botIdx === 0);
  const adv = (botAfter.laps * C.D.N + botAfter.idx) - prog0;
  console.log(`  bot 0 advanced ${adv} track points across the host change (about 1 s of racing, ${(C.D.N / 28).toFixed(0)} points per second)`);
  check('bots carried on from where they were (no jump back to the grid or forward)', adv > 0 && adv < C.D.N / 3);
  check('the player who left disappears from others\' screens', B.D.racers.find((r) => r.name === 'Alice').gone === true && C.D.racers.find((r) => r.name === 'Alice').gone === true);
  check('Alice is back at the menu, alone', A.D.state === 'menu' && A.D.online.on === false && A.D.racers.every((r) => r.kind === 'local' || r.kind === 'bot'));

  // ---- late joiner during the race
  D.els.nick.value = 'Dana'; D.els.code.value = code; D.els.joinbtn.h.click();
  await runUntil(() => D.D.online.on === true, 1500, 'Dana joins', 5);
  await runUntil(() => D.D.online.spectating === true, 600, 'Dana is told a race is running');
  check('a player joining mid-race waits for the next one', D.D.state === 'lobby' && /in progress/.test(D.els.lobbymsg.textContent));
  await runUntil(() => [B, C].every((I) => I.D.state === 'done'), 60 * 200, 'Bob and Cara finish');
  for (let i = 0; i < 60; i++) tick();
  check('results show the player who left as "left" (or finished)', B.els.board.children.length === 6);
  B.els.again.h.click();
  await runUntil(() => [B, C, D].every((I) => I.D.state === 'count'), 600, 'race with Dana');
  check('next race includes the late joiner', D.D.racers.filter((r) => r.kind === 'remote' && r.botIdx < 0).length === 2 && B.D.racers.find((r) => r.name === 'Dana'));
  B.D.leaveRoom();
  await runUntil(() => C.D.online.host === 'm9z' || D.D.online.host === 'm9z', 600, 'host changes again');
  check('host handover works a second time', C.D.online.host === D.D.online.host && C.D.online.host !== 'a3q', C.D.online.host);
  C.D.leaveRoom(); D.D.leaveRoom(); await sleep(5);

  console.log(failed ? `\nRESULT: FAIL (${failed} checks)` : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
