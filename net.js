/* HFB Racing - online rooms over PeerJS (WebRTC).
 *
 * Gives game.js the same small "room" interface the Claude artifact page provides:
 *   HFBNet.join(code, create) -> Promise<room>
 *   room.presence(patch)   merge fields into my shared state
 *   room.peers()           snapshot array of { peer, kind, presence, isMe, sameTab }
 *   room.onPeers(_, onClose)
 *   room.leave()
 *
 * Topology: a star. The player who creates the room registers the PeerJS id "hfb-racing-<code>"
 * and acts as the hub. Everyone else connects to that id. The hub relays every update to the
 * others, so the room lasts only while the creator's tab stays open.
 *
 * Settings you may want to change are at the top. PeerJS's free public broker (0.peerjs.com)
 * only introduces players to each other; race data then flows directly between browsers.
 * Players behind strict NATs or some corporate/mobile networks need a TURN server (see ICE below).
 */
(function () {
  'use strict';

  const PREFIX = 'hfb-racing-';
  const MAX_PLAYERS = 6;
  const CONNECT_TIMEOUT_MS = 12000;
  const KEEPALIVE_MS = 3000;     // every side sends something at least this often
  const SILENCE_MS = 12000;      // ...and drops a connection that has been silent this long

  // To self-host the broker: { host: 'peers.example.com', port: 443, secure: true, path: '/' }
  const BROKER = {};
  // Add a TURN server here if some players cannot connect:
  //   { urls: 'turn:turn.example.com:3478', username: '...', credential: '...' }
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];

  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // The hub never trusts other players: they may only set a short name, a version label, their own kart state and their own rocket events.
  function cleanClientPatch(p) {
    const out = {};
    if (!plain(p)) return out;
    if (typeof p.ver === 'string') out.ver = p.ver.slice(0, 24);
    if (typeof p.nick === 'string') out.nick = p.nick.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12);
    if (Array.isArray(p.s) && p.s.length <= 12 && p.s.every((x) => typeof x === 'number' && isFinite(x))) out.s = p.s;
    for (const k of ['f', 'x']) if (Array.isArray(p[k]) && p[k].length >= 5 && p[k].length <= 8 && p[k].every((v) => typeof v === 'number' && isFinite(v))) out[k] = p[k]; // rocket fired / my kart was hit (chaos races)
    return out;
  }

  let current = null; // the room object that is currently open (cleaned up on page close)

  function join(code, create) {
    return new Promise((resolve, reject) => {
      const hostId = PREFIX + String(code).toLowerCase();
      const state = new Map();        // label -> presence object (replaced, never mutated)
      const conns = new Map();        // hub: label -> DataConnection
      const heard = new Map();        // hub: label -> time of last message
      let me = '', hostConn = null, settled = false, closed = false, dirty = true, snap = [];
      let onClose = () => {}, timer = null, lastHeard = Date.now();

      const peer = new Peer(create ? hostId : undefined, Object.assign({ debug: 0, config: { iceServers: ICE } }, BROKER));

      const fail = (c) => {
        const err = Object.assign(new Error(c), { code: c });
        const was = settled, wasClosed = closed; settled = true;
        shutdown();
        if (!was) reject(err); else if (!wasClosed) onClose(err);
      };
      function shutdown() {
        const already = closed; closed = true;
        clearInterval(timer); clearTimeout(connectTimer);
        if (already) return;
        if (current === room) current = null;
        try { conns.forEach((c) => c.close()); } catch (e) { /* ignore */ }
        try { if (hostConn) hostConn.close(); } catch (e) { /* ignore */ }
        try { peer.destroy(); } catch (e) { /* ignore */ }
      }

      const put = (label, patch) => { state.set(label, Object.assign({}, state.get(label) || {}, patch)); dirty = true; };
      const send = (c, m) => { try { if (c.open) c.send(m); } catch (e) { /* connection is going away */ } };
      const fanOut = (m, except) => conns.forEach((c, l) => { if (l !== except) send(c, m); });
      const drop = (label) => {
        if (!conns.has(label) && !state.has(label)) return;
        conns.delete(label); heard.delete(label); state.delete(label); dirty = true;
        fanOut({ t: 'x', l: label });
      };

      const room = {
        p2p: true,
        presence(patch) {
          if (closed || !me) return Promise.resolve();
          put(me, patch);
          if (create) fanOut({ t: 'd', l: me, p: patch }); else send(hostConn, { t: 'p', p: patch });
          return Promise.resolve();
        },
        peers() {
          if (dirty) {
            snap = Object.freeze(Array.from(state, ([label, presence]) => Object.freeze({ peer: label, kind: 'viewer', presence, isMe: label === me, sameTab: label === me, guest: false })));
            dirty = false;
          }
          return snap;
        },
        onPeers(_ignored, closeFn) { onClose = typeof closeFn === 'function' ? closeFn : () => {}; return () => {}; },
        leave() { shutdown(); return Promise.resolve(); },
      };

      const connectTimer = setTimeout(() => { if (!settled) fail('timeout'); }, CONNECT_TIMEOUT_MS);

      peer.on('error', (e) => {
        const t = e && e.type;
        // after connecting, broker hiccups are ignored: the data links and the silence timer decide
        if (!settled) fail(t === 'peer-unavailable' ? 'nohost' : t === 'unavailable-id' ? 'taken' : 'network');
      });

      timer = setInterval(() => {
        if (closed) return;
        const now = Date.now();
        if (create) {
          fanOut({ t: 'k' });
          heard.forEach((at, l) => { if (now - at > SILENCE_MS) { try { conns.get(l).close(); } catch (e) { /* ignore */ } drop(l); } });
        } else if (hostConn) {
          send(hostConn, { t: 'k' });
          if (settled && now - lastHeard > SILENCE_MS) fail('lost');
        }
      }, KEEPALIVE_MS);

      if (create) {
        peer.on('open', () => {
          me = hostId; put(me, {}); settled = true; current = room; resolve(room);
        });
        peer.on('connection', (conn) => {
          const label = conn.peer;
          conn.on('open', () => {
            if (closed) { conn.close(); return; }
            if (state.size >= MAX_PLAYERS) { send(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 300); return; }
            conns.set(label, conn); heard.set(label, Date.now()); put(label, {});
            send(conn, { t: 'w', me: label, all: Object.fromEntries(state) });
            fanOut({ t: 'd', l: label, p: {} }, label);
          });
          conn.on('data', (m) => {
            if (!plain(m) || !conns.has(label)) return;
            heard.set(label, Date.now());
            if (m.t !== 'p') return;
            const patch = cleanClientPatch(m.p);
            put(label, patch);
            fanOut({ t: 'd', l: label, p: patch }, label);
          });
          conn.on('close', () => { if (conns.get(label) === conn) drop(label); });
          conn.on('error', () => { if (conns.get(label) === conn) drop(label); });
        });
      } else {
        peer.on('open', () => {
          hostConn = peer.connect(hostId, { reliable: true, serialization: 'json' });
          hostConn.on('data', (m) => {
            lastHeard = Date.now();
            if (!plain(m)) return;
            if (m.t === 'full') { fail('full'); return; }
            if (m.t === 'w' && !settled && plain(m.all) && typeof m.me === 'string') {
              me = m.me;
              for (const [l, p] of Object.entries(m.all)) if (plain(p)) state.set(l, p);
              dirty = true; settled = true; current = room; resolve(room);
            } else if (m.t === 'd' && settled && typeof m.l === 'string' && m.l.length < 80 && plain(m.p)) {
              put(m.l, m.p);
            } else if (m.t === 'x' && settled && typeof m.l === 'string') {
              if (state.delete(m.l)) dirty = true;
            }
          });
          hostConn.on('close', () => fail(settled ? 'lost' : 'nohost'));
          hostConn.on('error', () => fail(settled ? 'lost' : 'network'));
        });
      }
    });
  }

  window.addEventListener('pagehide', () => { if (current) current.leave(); });
  window.HFBNet = { p2p: true, available: () => typeof window.Peer === 'function', join };
})();
