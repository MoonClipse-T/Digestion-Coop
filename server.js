/* ============================================================
   server.js — 선생님 노트북에서 돌리는 게임 서버
   실행:  node server.js      (npm install 필요 없음)
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { attach } = require('./ws-lite.js');
const Core = require('./game-core.js');
const G = require('./public/js/gamedata.js');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- 정적 파일 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(PUBLIC, path.normalize(url).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('없는 파일: ' + url); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

/* ============================================================
   방 관리
   ============================================================ */
const rooms = new Map();   // code -> room
const ROLE_NAME = { tract: '소화관', juice: '소화액' };

function makeCode() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function createRoom(hostName) {
  const code = makeCode();
  const room = {
    code,
    createdAt: Date.now(),
    players: { tract: null, juice: null },   // {ws, name, ready}
    watchers: new Set(),                     // 교사 화면
    g: Core.newGame(),
    lastTick: Date.now(),
    log: []
  };
  rooms.set(code, room);
  return room;
}

function roomInfo(room) {
  return {
    code: room.code,
    players: {
      tract: room.players.tract ? { name: room.players.tract.name, ready: room.players.tract.ready, online: room.players.tract.ws.readyState === 1 } : null,
      juice: room.players.juice ? { name: room.players.juice.name, ready: room.players.juice.ready, online: room.players.juice.ws.readyState === 1 } : null
    }
  };
}

function send(ws, type, data) {
  if (!ws || ws.readyState !== 1) return;
  ws.sendJSON(Object.assign({ type }, data || {}));
}

function broadcast(room, type, data) {
  for (const role of ['tract', 'juice']) {
    const p = room.players[role];
    if (p) send(p.ws, type, data);
  }
  for (const w of room.watchers) send(w, type, data);
}

function bothReady(room) {
  return room.players.tract && room.players.juice &&
         room.players.tract.ready && room.players.juice.ready;
}

// 방은 그대로 두고 게임만 처음으로 — 대기실로 돌아간다
function resetRoom(room) {
  room.g = Core.newGame();
  room._resultLogged = false;
  for (const r of ['tract', 'juice']) if (room.players[r]) room.players[r].ready = false;
  room.log.push({ t: Date.now(), msg: '다시하기 — 대기실로' });
  broadcast(room, 'reset', { info: roomInfo(room) });
}

function startGame(room) {
  room.g = Core.newGame();
  room.g.phase = 'countdown';
  room.g.countdown = 4;
  room.log.push({ t: Date.now(), msg: '게임 시작' });
  broadcast(room, 'start', { info: roomInfo(room) });
}

/* ---------------- 게임 루프 ---------------- */
const TICK_MS = Math.round(1000 / G.RULES.TICK_HZ);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const dt = Math.min(0.25, (now - room.lastTick) / 1000);
    room.lastTick = now;
    const g = room.g;

    if (g.phase === 'countdown' || g.phase === 'playing') Core.tick(g, dt);
    else if (g.phase === 'stageclear') Core.tickClear(g, dt);

    const events = Core.drainEvents(g);
    if (g.phase !== 'lobby') {
      const snap = Core.snapshot(g);
      broadcast(room, 'state', { s: snap, ev: events });
      if (g.result && !room._resultLogged) {
        room._resultLogged = true;
        room.log.push({ t: now, msg: '결과: ' + g.result.verdict + ' (' + g.result.grade + '등급, ' + g.result.score + '점)' });
      }
    }

    // 두 명 다 나가고 3분 지난 방은 정리
    const alive = ['tract', 'juice'].some(r => room.players[r] && room.players[r].ws.readyState === 1);
    if (!alive) {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 180000 && room.watchers.size === 0) rooms.delete(code);
    } else room.emptySince = null;
  }
}, TICK_MS);

/* ============================================================
   WebSocket
   ============================================================ */
function roleOf(room, ws) {
  if (!room) return null;
  if (room.players.tract && room.players.tract.ws === ws) return 'tract';
  if (room.players.juice && room.players.juice.ws === ws) return 'juice';
  return null;
}

attach(server, (ws) => {
  let myRoom = null, myName = '';
  const R = () => roleOf(myRoom, ws);          // 지금 내 역할

  const bail = (msg) => send(ws, 'error', { msg });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.type !== 'string') return;

    switch (m.type) {

      /* ---------- 방 만들기 ---------- */
      case 'create': {
        myName = String(m.name || '플레이어').slice(0, 10);
        const role = (m.role === 'juice') ? 'juice' : 'tract';
        const room = createRoom(myName);
        room.players[role] = { ws, name: myName, ready: false };
        myRoom = room;
        send(ws, 'joined', { code: room.code, role, roleName: ROLE_NAME[role], info: roomInfo(room) });
        room.log.push({ t: Date.now(), msg: myName + '(' + ROLE_NAME[role] + ') 방 생성' });
        break;
      }

      /* ---------- 방 들어가기 ---------- */
      case 'join': {
        const code = String(m.code || '').trim();
        const room = rooms.get(code);
        if (!room) { bail('그런 방이 없습니다. 방 번호를 다시 확인하세요.'); return; }
        myName = String(m.name || '플레이어').slice(0, 10);

        // 비어 있거나 끊긴 자리 찾기
        let want = (m.role === 'tract' || m.role === 'juice') ? m.role : null;
        const free = (r) => !room.players[r] || room.players[r].ws.readyState !== 1;
        if (!want || !free(want)) want = free('tract') ? 'tract' : (free('juice') ? 'juice' : null);
        if (!want) { bail('이 방은 이미 2명이 꽉 찼습니다.'); return; }

        room.players[want] = { ws, name: myName, ready: false };
        myRoom = room;
        send(ws, 'joined', { code: room.code, role: want, roleName: ROLE_NAME[want], info: roomInfo(room) });
        broadcast(room, 'room', { info: roomInfo(room) });
        room.log.push({ t: Date.now(), msg: myName + '(' + ROLE_NAME[want] + ') 입장' });
        break;
      }

      /* ---------- 역할 바꾸기 : 짝꿍에게 요청하고, 수락해야 바뀐다 ---------- */
      case 'swapAsk': {
        const role = R();
        if (!myRoom || !role) return;
        if (myRoom.g.phase !== 'lobby') { bail('게임 중에는 역할을 바꿀 수 없습니다.'); return; }
        const other = role === 'tract' ? 'juice' : 'tract';
        const op = myRoom.players[other];
        if (!op || op.ws.readyState !== 1) {          // 짝꿍이 아직 없으면 바로 바꾼다
          myRoom.players[other] = myRoom.players[role];
          myRoom.players[role] = null;
          send(ws, 'joined', { code: myRoom.code, role: other, roleName: ROLE_NAME[other], info: roomInfo(myRoom) });
          broadcast(myRoom, 'room', { info: roomInfo(myRoom) });
          return;
        }
        send(op.ws, 'swapAsk', { from: myName });
        send(ws, 'swapWait', { to: op.name });
        break;
      }

      case 'swapAnswer': {
        const role = R();
        if (!myRoom || !role || myRoom.g.phase !== 'lobby') return;
        const other = role === 'tract' ? 'juice' : 'tract';
        const op = myRoom.players[other];
        if (!op) return;
        if (!m.ok) {
          send(op.ws, 'swapDenied', { by: myName });
          send(ws, 'swapClosed', {});
          return;
        }
        const t = myRoom.players.tract, j = myRoom.players.juice;
        myRoom.players.tract = j; myRoom.players.juice = t;
        for (const r of ['tract', 'juice']) if (myRoom.players[r]) myRoom.players[r].ready = false;
        for (const r of ['tract', 'juice']) {
          const p = myRoom.players[r];
          if (p) send(p.ws, 'joined', { code: myRoom.code, role: r, roleName: ROLE_NAME[r], info: roomInfo(myRoom), swapped: true });
        }
        broadcast(myRoom, 'room', { info: roomInfo(myRoom) });
        myRoom.log.push({ t: Date.now(), msg: '역할 교체' });
        break;
      }

      /* ---------- 준비 ---------- */
      case 'ready': {
        const role = R();
        if (!myRoom || !role || !myRoom.players[role]) return;
        myRoom.players[role].ready = !!m.ready;
        broadcast(myRoom, 'room', { info: roomInfo(myRoom) });
        if (bothReady(myRoom) && myRoom.g.phase === 'lobby') startGame(myRoom);
        break;
      }

      /* ---------- 게임 행동 ---------- */
      case 'act': {
        const role = R();
        if (!myRoom || !role) return;
        const g = myRoom.g;
        if (g.phase !== 'playing') return;
        const a = m.a;
        if (!a || typeof a.t !== 'string') return;
        // 초당 행동 수 제한 (치트 · 폭주 방지)
        const p = myRoom.players[role];
        const now = Date.now();
        p._win = p._win || { t: now, n: 0 };
        if (now - p._win.t > 1000) p._win = { t: now, n: 0 };
        if (++p._win.n > 45) return;
        Core.applyAction(g, role, a);
        break;
      }

      /* ---------- 상대에게 보내는 실시간 표시(미니게임 화면 공유) ---------- */
      case 'peek': {
        const role = R();
        if (!myRoom || !role) return;
        const other = role === 'tract' ? 'juice' : 'tract';
        const op = myRoom.players[other];
        if (op) send(op.ws, 'peek', { from: role, d: m.d });
        for (const w of myRoom.watchers) send(w, 'peek', { from: role, d: m.d, code: myRoom.code });
        break;
      }

      /* ---------- 다시하기 : 역할 바꾸기와 똑같이 요청 → 수락 ---------- */
      case 'againAsk': {
        const role = R();
        if (!myRoom || !role) return;
        const other = role === 'tract' ? 'juice' : 'tract';
        const op = myRoom.players[other];
        if (!op || op.ws.readyState !== 1) { resetRoom(myRoom); return; }  // 혼자면 바로
        send(op.ws, 'againAsk', { from: myName });
        send(ws, 'againWait', { to: op.name });
        break;
      }

      case 'againAnswer': {
        const role = R();
        if (!myRoom || !role) return;
        const other = role === 'tract' ? 'juice' : 'tract';
        const op = myRoom.players[other];
        if (!m.ok) {
          if (op) send(op.ws, 'againDenied', { by: myName });
          send(ws, 'againClosed', {});
          return;
        }
        resetRoom(myRoom);
        break;
      }

      // 옛 클라이언트 호환
      case 'again': { if (myRoom) resetRoom(myRoom); break; }

      /* ---------- 교사 화면 ---------- */
      case 'watch': {
        for (const [, room] of rooms) room.watchers.delete(ws);
        if (m.code) {
          const room = rooms.get(String(m.code));
          if (room) { room.watchers.add(ws); send(ws, 'watching', { code: room.code, info: roomInfo(room) }); }
        }
        break;
      }
      case 'rooms': {
        const list = [];
        for (const [code, room] of rooms) {
          const g = room.g;
          list.push({
            code,
            tract: room.players.tract ? room.players.tract.name : null,
            juice: room.players.juice ? room.players.juice.name : null,
            online: ['tract', 'juice'].filter(r => room.players[r] && room.players[r].ws.readyState === 1).length,
            phase: g.phase,
            stage: Core.stage(g).name,
            progress: Math.round(Core.progress(g)),
            trouble: Math.round(g.trouble),
            score: g.score,
            mistakes: g.mistakes.length,
            result: g.result ? { grade: g.result.grade, verdict: g.result.verdict, bristol: g.result.bristol } : null
          });
        }
        list.sort((a, b) => a.code.localeCompare(b.code));
        send(ws, 'rooms', { list, total: rooms.size });
        break;
      }

      case 'kick': {   // 교사가 방 초기화
        const room = rooms.get(String(m.code || ''));
        if (room) resetRoom(room);
        break;
      }
    }
  });

  ws.on('close', () => {
    for (const [, room] of rooms) room.watchers.delete(ws);
    const role = roleOf(myRoom, ws);
    if (myRoom && role) {
      myRoom.log.push({ t: Date.now(), msg: myName + ' 연결 끊김' });
      broadcast(myRoom, 'room', { info: roomInfo(myRoom), left: role });
    }
  });
});

/* ---------------- 시작 ---------------- */
function localIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const k in ifs) for (const i of ifs[k]) {
    if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   소화계 협동 대작전 — 서버가 켜졌습니다              ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  학생 태블릿 주소 (칠판에 적어 주세요)');
  if (ips.length === 0) console.log('    http://localhost:' + PORT);
  ips.forEach(ip => console.log('    ➜  http://' + ip + ':' + PORT));
  console.log('');
  console.log('  선생님 화면');
  ips.forEach(ip => console.log('    ➜  http://' + ip + ':' + PORT + '/teacher.html'));
  if (ips.length === 0) console.log('    ➜  http://localhost:' + PORT + '/teacher.html');
  console.log('');
  console.log('  끄려면 이 창에서 Ctrl+C');
  console.log('');
});

module.exports = { server, rooms, createRoom };
