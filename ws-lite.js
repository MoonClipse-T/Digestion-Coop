/* ============================================================
   ws-lite.js — 의존성 0 WebSocket 서버 (RFC 6455 최소 구현)
   npm install 없이 동작하도록 직접 구현했습니다.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const EventEmitter = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = 1;           // 1 = OPEN
    this._buf = Buffer.alloc(0);
    this._fragOp = 0;
    this._frag = [];
    this.isAlive = true;

    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._die());
    socket.on('error', () => this._die());
    socket.on('timeout', () => this._die());
  }

  _die() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }

  _onData(d) {
    this._buf = Buffer.concat([this._buf, d]);
    // 비정상적으로 큰 버퍼는 잘라낸다 (방어)
    if (this._buf.length > 8 * 1024 * 1024) { this.close(); return; }
    let guard = 0;
    while (this._readFrame() && guard++ < 512) { /* keep parsing */ }
  }

  _readFrame() {
    const b = this._buf;
    if (b.length < 2) return false;

    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;

    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      const big = b.readBigUInt64BE(2);
      if (big > 8000000n) { this.close(); return false; }
      len = Number(big); off = 10;
    }

    let mask = null;
    if (masked) {
      if (b.length < off + 4) return false;
      mask = b.subarray(off, off + 4);
      off += 4;
    }
    if (b.length < off + len) return false;

    let payload = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
    this._buf = b.subarray(off + len);

    if (opcode === 0x8) { this.close(); return false; }          // close
    if (opcode === 0x9) { this._send(0xA, payload); return true; } // ping -> pong
    if (opcode === 0xA) { this.isAlive = true; return true; }      // pong

    if (opcode === 0x0) {                                          // continuation
      this._frag.push(payload);
      if (fin) { this._deliver(this._fragOp, Buffer.concat(this._frag)); this._frag = []; this._fragOp = 0; }
      return true;
    }
    if (opcode === 0x1 || opcode === 0x2) {
      if (!fin) { this._fragOp = opcode; this._frag = [payload]; return true; }
      this._deliver(opcode, payload);
      return true;
    }
    return true;
  }

  _deliver(opcode, payload) {
    this.isAlive = true;
    if (opcode === 0x1) this.emit('message', payload.toString('utf8'));
    else this.emit('binary', payload);
  }

  _send(opcode, payload) {
    if (this.readyState !== 1) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | opcode;
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) { this._die(); }
  }

  send(text) { this._send(0x1, Buffer.from(String(text), 'utf8')); }
  sendJSON(obj) { this.send(JSON.stringify(obj)); }
  ping() { this._send(0x9, Buffer.alloc(0)); }

  close() {
    if (this.readyState === 3) return;
    try { this._send(0x8, Buffer.alloc(0)); this.socket.end(); } catch (e) {}
    this._die();
  }
}

function attach(httpServer, onConnection) {
  httpServer.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { try { socket.destroy(); } catch (e) {} return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    socket.setNoDelay(true);
    socket.setTimeout(0);
    const ws = new WSConn(socket);
    onConnection(ws, req);
  });

  // 끊긴 연결 정리 (30초 핑)
  const iv = setInterval(() => {
    for (const c of attach.clients) {
      if (c.readyState !== 1) { attach.clients.delete(c); continue; }
      if (!c.isAlive) { c.close(); attach.clients.delete(c); continue; }
      c.isAlive = false; c.ping();
    }
  }, 30000);
  if (iv.unref) iv.unref();
}
attach.clients = new Set();

module.exports = { attach, WSConn };
