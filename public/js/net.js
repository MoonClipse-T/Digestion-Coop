/* net.js — 서버와의 연결 */
(function () {
  const Net = {
    ws: null, connected: false, handlers: {}, queue: [],
    code: null, role: null, roleName: null, info: null,

    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; },
    emit(type, data) { (this.handlers[type] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } }); },

    connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(proto + '://' + location.host);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.emit('open');
        while (this.queue.length) ws.send(this.queue.shift());
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === 'joined') { this.code = m.code; this.role = m.role; this.roleName = m.roleName; this.info = m.info; }
        if (m.type === 'room' || m.type === 'reset' || m.type === 'start') { if (m.info) this.info = m.info; }
        this.emit(m.type, m);
      };
      ws.onclose = () => { this.connected = false; this.emit('close'); setTimeout(() => this.connect(), 2000); };
      ws.onerror = () => {};
    },

    send(obj) {
      const s = JSON.stringify(obj);
      if (this.ws && this.ws.readyState === 1) this.ws.send(s);
      else this.queue.push(s);
    },

    act(a) { this.send({ type: 'act', a }); },
    peek(d) { this.send({ type: 'peek', d }); }
  };
  window.Net = Net;
})();
