// Multi-client headless test of the PeerJS transport: real game.js + real net.js over a fake PeerJS network with latency.
// Usage: node msim_p2p.js <game.js> <net.js>
const fs = require('fs'), path = require('path');
const THREE = require('./node_modules/three/build/three.js');
globalThis.THREE = THREE;
new Function(fs.readFileSync('./node_modules/three/examples/js/loaders/GLTFLoader.js', 'utf8'))();
THREE.WebGLRenderer = class { setPixelRatio() {} setSize() {} render() {} };

let src = fs.readFileSync(process.argv[2], 'utf8');
src = src.replace('requestAnimationFrame(frame);\n})();', 'window.__dbg = { COURSES, get trackLen() { return trackLen; }, racers, player, online, COLORS, ranking, leaveRoom, get state() { return state; }, get loadedCourse() { return loadedCourse; }, get N() { return N; }, get pts() { return pts; }, get raceT() { return raceT; } };\nrequestAnimationFrame(frame);\n})();');
src = src.replace('const readInput = () => ({', 'const readInput = () => window.__inp ? window.__inp() : ({');
const cdir = path.join(path.dirname(path.resolve(process.argv[2])), 'courses');
globalThis.fetch = async (url) => {
  const name = decodeURIComponent(url.replace(/^courses\//, '')), f = path.join(cdir, name);
  if (!fs.existsSync(f)) return { ok: false };
  const b = fs.readFileSync(f); return { ok: true, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const GAME = new Function('window', 'document', 'THREE', 'requestAnimationFrame', src);
const NETSRC = fs.readFileSync(process.argv[3], 'utf8');
const NET = new Function('window', 'Peer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', NETSRC);

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

/* ---- fake PeerJS network: broker + direct data channels, LAT ms each way, JSON-cloned messages ---- */
const netw = { peers: new Map(), queue: [], timers: [], blackhole: new Set(), seq: 0 };
const vDate = { now: () => Math.floor(now) };
const at = (ms, fn) => netw.queue.push({ at: now + ms, fn });
function vSetTimeout(fn, ms) { const t = { next: now + ms, fn, once: true }; netw.timers.push(t); return t; }
function vSetInterval(fn, ms) { const t = { next: now + ms, fn, every: ms }; netw.timers.push(t); return t; }
const vClear = (t) => { netw.timers = netw.timers.filter((x) => x !== t); };
function flush() {
  for (let guard = 0; guard < 50; guard++) {
    const due = netw.queue.filter((q) => q.at <= now); if (!due.length) break;
    netw.queue = netw.queue.filter((q) => q.at > now); due.sort((a, b) => a.at - b.at).forEach((q) => q.fn());
  }
  for (const t of netw.timers.slice()) if (t.next <= now) { if (t.once) vClear(t); else t.next = now + t.every; t.fn(); }
}
function makePeerClass(defaultId) {
  return class FakePeer {
    constructor(id) {
      this.id = id || defaultId; this.h = {}; this.conns = new Set(); this.dead = false;
      at(30, () => {
        if (this.dead) return;
        if (netw.peers.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; }
        netw.peers.set(this.id, this); this.emit('open', this.id);
      });
    }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }
    emit(ev, a) { (this.h[ev] || []).forEach((f) => f(a)); }
    connect(id) {
      const mine = new FakeConn(this, id); this.conns.add(mine);
      at(LAT, () => {
        const target = netw.peers.get(id);
        if (this.dead) return;
        if (!target || target.dead) { this.emit('error', { type: 'peer-unavailable' }); return; }
        const theirs = new FakeConn(target, this.id); target.conns.add(theirs); mine.other = theirs; theirs.other = mine;
        target.emit('connection', theirs);
        at(LAT, () => { mine.open = true; mine.emit('open'); theirs.open = true; theirs.emit('open'); });
      });
      return mine;
    }
    destroy() { this.dead = true; netw.peers.delete(this.id); this.conns.forEach((c) => c.close()); }
  };
}
class FakeConn {
  constructor(owner, remoteId) { this.owner = owner; this.peer = remoteId; this.open = false; this.h = {}; this.other = null; }
  on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }
  emit(ev, a) { (this.h[ev] || []).forEach((f) => f(a)); }
  send(m) {
    if (!this.open) return; const raw = JSON.stringify(m), from = this.owner.id; if (netw.blackhole.has(from)) return;
    const o = this.other; at(LAT, () => { if (o && o.open) o.emit('data', JSON.parse(raw)); });
  }
  close() { if (!this.open && !this.other) return; this.open = false; const o = this.other; at(LAT, () => { if (o && o.open) { o.open = false; o.emit('close'); } }); }
}

function makeInstance(who, label, proto = 'http:') {
  const els = new Proxy({}, { get: (t, k) => t[k] || (t[k] = el()) }), handlers = {}; let raf = null;
  const document = { getElementById: (id) => els[id], createElement: () => el(), querySelectorAll: () => [], addEventListener() {}, hidden: false };
  const Peer = makePeerClass(label);
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, Peer, location: { protocol: proto },
    addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); } };
  NET(window, Peer, vSetTimeout, vClear, vSetInterval, vClear, vDate);
  GAME(window, document, THREE, (f) => { raf = f; });
  const inst = { who, label, els, window, handlers, Peer, get D() { return window.__dbg; }, frame: (t) => raf && raf(t) };
  window.__inp = () => {
    const D = window.__dbg, p = D.player, k = (p.idx + 8) % D.N, t = D.pts[k];
    const d = Math.atan2(Math.sin(Math.atan2(t.x - p.x, t.z - p.z) - p.h), Math.cos(Math.atan2(t.x - p.x, t.z - p.z) - p.h));
    return { steer: Math.max(-1, Math.min(1, d * 2.2)), gas: Math.abs(d) < 0.5 || p.speed < 18, brake: Math.abs(d) > 0.9 && p.speed > 22, drift: false };
  };
  return inst;
}

// a hand-rolled client that does not follow the rules (for hostile / filler connections)
function rawClient(id, hostCode, patch) {
  const P = makePeerClass(id), p = new P(id), out = { id, got: [], closed: false };
  p.on('open', () => {
    const c = p.connect('hfb-racing-' + hostCode.toLowerCase()); out.conn = c;
    c.on('data', (m) => out.got.push(m)); c.on('close', () => { out.closed = true; });
    c.on('open', () => { if (patch) c.send({ t: 'p', p: patch }); });
  });
  out.peer = p; return out;
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
const listOf = (I) => I.els.players.children.map((li) => li.children[0].textContent).sort().join(',');
const frames = (n) => { for (let i = 0; i < n; i++) tick(); };

(async () => {
  const A = makeInstance('Alice', 'k7x'), B = makeInstance('Bob', 'a3q'), C = makeInstance('Cara', 'm9z'), D = makeInstance('Dana', 'z1d');
  all.push(A, B, C, D);
  frames(6); await sleep(300); frames(2);
  check('all players loaded the course from courses/', [A, B, C, D].every((I) => I.D.COURSES.some((c) => c.id === 'lakeside')), A.D.COURSES.map((c) => c.id).join(','));
  check('Race online button shows when PeerJS is present', [A, B, C, D].every((I) => I.els.online.hidden === false));
  const bare = { addEventListener() {} }; const noPeerNet = new Function('window', 'Peer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', NETSRC);
  noPeerNet(bare, undefined, vSetTimeout, vClear, vSetInterval, vClear, vDate);
  check('without the PeerJS library the adapter reports unavailable (button stays hidden)', bare.HFBNet.available() === false);

  // ---- create + join
  A.els.nick.value = 'Alice'; A.els.create.h.click();
  await runUntil(() => A.D.state === 'lobby', 800, 'Alice in lobby', 2);
  const code = A.els.roomcode.textContent;
  check('Alice created a room and sees a 5-character code', /^[A-Z2-9]{5}$/.test(code), code);
  B.els.nick.value = 'B<o>b!!'; B.els.code.value = code.toLowerCase(); B.els.joinbtn.h.click();
  C.els.nick.value = 'Cara'; C.els.code.value = code; C.els.joinbtn.h.click();
  await runUntil(() => B.D.state === 'lobby' && C.D.state === 'lobby', 1500, 'Bob and Cara in lobby', 2);
  await runUntil(() => [A, B, C].every((I) => I.els.players.children.length === 3), 600, 'all see 3 players');
  frames(40);
  check('everyone sees all three players in the lobby', [A, B, C].every((I) => I.els.players.children.length === 3), listOf(A));
  check('nickname "B<o>b!!" was cleaned to "Bob"', B.els.players.children.some((li) => li.children[0].textContent === 'Bob (you)') && A.els.players.children.some((li) => li.children[0].textContent === 'Bob'));
  check('creator is host on every screen', [A, B, C].every((I) => I.D.online.host === 'hfb-racing-' + code.toLowerCase()) && A.els.startonline.hidden === false && B.els.startonline.hidden === true && B.els.lobbywait.hidden === false);

  // ---- hostile client cannot make itself host or change the race
  const evil = rawClient('evil1', code, { creator: true, nick: '<script>Ev il', race: { n: 99, phase: 'live', course: 'ridge', roster: ['evil1'] }, bots: [[0]], s: 'nope' });
  await runUntil(() => A.els.players.children.length === 4, 600, 'evil joins');
  frames(30);
  check('a modified client\'s "creator" and "race" fields are ignored by the hub', A.D.online.host === 'hfb-racing-' + code.toLowerCase() && A.D.online.cfg.n === 0 && [A, B, C].every((I) => I.D.loadedCourse !== 'ridge'), 'n=' + A.D.online.cfg.n);
  check('its name is cleaned by the hub', /^scriptEv il$/.test(A.D.online.byLabel.get('evil1').presence.nick), A.D.online.byLabel.get('evil1').presence.nick);
  evil.conn.close();
  await runUntil(() => A.els.players.children.length === 3 && C.els.players.children.length === 3, 600, 'evil leaves');
  check('a player who disconnects is removed from the lobby for everyone', true);

  // ---- wrong code, full room, taken id
  D.els.nick.value = 'Dana'; D.els.code.value = 'QQQQQ'; D.els.joinbtn.h.click();
  await runUntil(() => /No room/.test(D.els.joinmsg.textContent), 800, 'bad code message', 2);
  check('a code with no room is rejected and stays out', D.D.state === 'menu' && D.D.online.on === false, D.els.joinmsg.textContent);
  const fillers = ['f1', 'f2', 'f3'].map((id) => rawClient(id, code));
  await runUntil(() => A.els.players.children.length === 6, 800, 'room fills');
  D.els.code.value = code; D.els.joinbtn.h.click();
  await runUntil(() => /full/.test(D.els.joinmsg.textContent), 800, 'full message', 2);
  check('a 7th player is told the room is full and stays out', D.D.online.on === false && D.D.state === 'menu', D.els.joinmsg.textContent);
  fillers.forEach((f) => f.conn.close());
  await runUntil(() => A.els.players.children.length === 3, 600, 'fillers leave');
  let takenCode = ''; A.window.HFBNet.join('ZZZZZ', true).then(() => B.window.HFBNet.join('ZZZZZ', true), (e) => { takenCode = 'first failed ' + e.code; }).then(() => { takenCode = 'second succeeded'; }, (e) => { takenCode = e.code; });
  // the promises above resolve only while time passes
  await runUntil(() => takenCode !== '', 600, 'taken id result', 1);
  check('creating a room with a code that is already in use is refused', takenCode === 'taken', takenCode);

  // ---- a course loaded from courses/ works in the online lobby too
  (() => { const sel = A.els.lobbypicker; sel.value = 'lakeside'; sel.h.change({ target: sel }); })();
  await runUntil(() => [A, B, C].every((I) => I.D.loadedCourse === 'lakeside'), 600, 'lakeside sync');
  check('host picking a file-based course loads the same track for everyone', new Set([A, B, C].map((I) => I.D.trackLen.toFixed(1))).size === 1 && A.D.N > 300, 'N=' + A.D.N + ' len=' + A.D.trackLen.toFixed(0));
  check('lobby text shows that course\'s description', /Lakeside|flowing/.test(B.els.lobbymsg.textContent), B.els.lobbymsg.textContent);

  // ---- course sync + start
  (() => { const sel = A.els.lobbypicker; sel.value = 'harbour'; sel.h.change({ target: sel }); })();
  await runUntil(() => [A, B, C].every((I) => I.D.loadedCourse === 'harbour'), 600, 'course sync');
  check('host picking a course changes it for everyone', true);
  check('non-host course buttons are disabled', B.els.lobbypicker.disabled === true);
  A.els.startonline.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'countdown starts');
  check('all three players start the countdown from the host\'s start', true);
  const aliceE = A.D.player.e, bobE = B.D.player.e, caraE = C.D.player.e;
  check('roster order is the same everywhere (grid slot per player)', new Set([aliceE, bobE, caraE]).size === 3 && B.D.racers.find((r) => r.name === 'Alice').e === aliceE && C.D.racers.find((r) => r.name === 'Bob').e === bobE, `Alice=${aliceE} Bob=${bobE} Cara=${caraE}`);
  check('each kart gets its own colour', [A, B, C].every((I) => I.D.player.color === I.D.COLORS[I.D.player.e]));
  console.log('  Alice sees:', names(A)); console.log('  Bob sees:  ', names(B));
  check('host runs the bots, others mirror them', A.D.racers.filter((r) => r.kind === 'bot').length === 3 && B.D.racers.filter((r) => r.kind === 'remote' && r.botIdx >= 0).length === 3 && C.D.racers.filter((r) => r.kind === 'bot').length === 0);

  // ---- race: sync accuracy
  let maxHuman = 0, maxBot = 0, samples = 0; const gaps = [], humans = [A, B, C];
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
  gaps.sort((a, b) => a - b); const p50 = gaps[Math.floor(gaps.length * 0.5)], p95 = gaps[Math.floor(gaps.length * 0.95)];
  console.log(`  worst gap: players ${maxHuman.toFixed(1)} m, bots ${maxBot.toFixed(1)} m (${samples} samples); median ${p50.toFixed(1)} m, 95th percentile ${p95.toFixed(1)} m`);
  check('remote karts stay within a few kart lengths at 80 ms per hop (median < 6, 95% < 10, worst < 14 m)', p50 < 6 && p95 < 10 && Math.max(maxHuman, maxBot) < 14);
  check('all three finished 3 laps', humans.every((I) => I.D.player.finished && I.D.player.laps >= 3));
  frames(90);
  const order = (I) => I.D.ranking().filter((r) => r.kind !== 'bot' && !(r.kind === 'remote' && r.botIdx >= 0)).map((r) => r.name).join('>');
  console.log('  finish order seen by Alice / Bob / Cara:', order(A), '/', order(B), '/', order(C));
  check('everyone sees the same finishing order of the players', order(A) === order(B) && order(B) === order(C));
  check('host sees "Race again" and "Back to lobby"; others wait', A.els.again.hidden === false && A.els.tolobby.hidden === false && B.els.again.hidden === true && B.els.waitmsg.hidden === false);

  // ---- race again, then a guest leaves mid-race
  A.els.again.h.click();
  await runUntil(() => [A, B, C].every((I) => I.D.state === 'count'), 600, 'second race starts');
  check('host "Race again" restarts for everyone', [A, B, C].every((I) => I.D.player.laps === -1 && !I.D.player.finished));
  await runUntil(() => A.D.raceT > 8, 60 * 40, 'race underway');
  B.D.leaveRoom();
  await runUntil(() => A.D.racers.find((r) => r.name === 'Bob').gone === true && C.D.racers.find((r) => r.name === 'Bob').gone === true, 600, 'Bob disappears');
  check('a player who leaves mid-race disappears from the others\' screens and the race goes on', A.D.state === 'race' && B.D.state === 'menu' && B.D.online.on === false);

  // ---- late joiner
  D.els.nick.value = 'Dana'; D.els.code.value = code; D.els.joinbtn.h.click();
  await runUntil(() => D.D.online.on === true, 1500, 'Dana joins', 2);
  await runUntil(() => D.D.online.spectating === true, 600, 'Dana is told a race is running');
  check('a player joining mid-race waits for the next one', D.D.state === 'lobby' && /in progress/.test(D.els.lobbymsg.textContent));
  await runUntil(() => [A, C].every((I) => I.D.state === 'done'), 60 * 200, 'Alice and Cara finish');
  frames(60);
  A.els.again.h.click();
  await runUntil(() => [A, C, D].every((I) => I.D.state === 'count'), 600, 'race with Dana');
  check('next race includes the late joiner', D.D.racers.filter((r) => r.kind === 'remote' && r.botIdx < 0).length === 2 && !!A.D.racers.find((r) => r.name === 'Dana'));

  // ---- host leaves: the room ends for everyone
  await runUntil(() => A.D.raceT > 5, 60 * 40, 'third race underway');
  A.D.leaveRoom();
  await runUntil(() => C.D.state === 'menu' && D.D.state === 'menu', 900, 'guests return to menu');
  check('when the host leaves, the others are returned to the menu with a message', C.D.online.on === false && /host left/.test(C.els.coursemsg.textContent) && /host left/.test(D.els.coursemsg.textContent), C.els.coursemsg.textContent);

  // ---- host goes silent (browser crash / sleep): guests time out
  A.els.nick.value = 'Alice'; A.els.create.h.click();
  await runUntil(() => A.D.state === 'lobby', 800, 'new room', 2);
  const code2 = A.els.roomcode.textContent;
  C.els.nick.value = 'Cara'; C.els.code.value = code2; C.els.joinbtn.h.click();
  await runUntil(() => C.D.state === 'lobby' && A.els.players.children.length === 2, 1500, 'Cara joins new room', 2);
  netw.blackhole.add('hfb-racing-' + code2.toLowerCase());
  const t0 = now;
  await runUntil(() => C.D.state === 'menu', 60 * 30, 'silent host detected');
  check('a host that stops responding is dropped after about 12 s', C.D.online.on === false && now - t0 > 11000 && now - t0 < 18000, `${((now - t0) / 1000).toFixed(1)} s`);
  A.D.leaveRoom();

  // ---- a player whose browser could not load the course file is sent back to the menu with an explanation
  const E = makeInstance('Eve', 'e5e', 'file:'); all.push(E); frames(10); await sleep(20);
  check('opened from a file:// address, courses/ is skipped quietly and built-in courses still work', E.D.COURSES.length === 8 && !E.D.COURSES.some((c) => c.gltf));
  A.els.nick.value = 'Alice'; A.els.create.h.click();
  await runUntil(() => A.D.state === 'lobby', 800, 'room 3', 2);
  const code3 = A.els.roomcode.textContent;
  E.els.nick.value = 'Eve'; E.els.code.value = code3; E.els.joinbtn.h.click();
  await runUntil(() => E.D.state === 'lobby' && A.els.players.children.length === 2, 1500, 'Eve joins', 2);
  (() => { const sel = A.els.lobbypicker; sel.value = 'lakeside'; sel.h.change({ target: sel }); })();
  await runUntil(() => /not loaded/.test(E.els.lobbymsg.textContent), 600, 'Eve told the course is missing');
  check('lobby tells that player the course has not loaded', true, E.els.lobbymsg.textContent);
  A.els.startonline.h.click();
  await runUntil(() => E.D.state === 'menu', 600, 'Eve returned to menu');
  check('starting a race on a course she lacks returns her to the menu with a message', E.D.online.on === false && /not loaded/.test(E.els.coursemsg.textContent), E.els.coursemsg.textContent);
  A.D.leaveRoom();

  console.log(failed ? `\nRESULT: FAIL (${failed} checks)` : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
