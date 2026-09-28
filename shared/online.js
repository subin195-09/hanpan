/* 한 판 놀이방 — 온라인 공용 모듈 (PeerJS WebRTC)
 *
 * createOnline = 둘이 하는 방 (아래 설명), createParty = 여럿이 하는 방 (파일 아래쪽 설명)
 *
 * 두 브라우저가 직접 연결되고, 수를 둘 때마다 판 전체 상태를 상대에게 보낸다.
 * 방장 = 먼저 두는 쪽, 참가자 = 나중에 두는 쪽. 방 코드 6자리, 초대 링크는 ?room=코드.
 *
 * 사용법 (게임 쪽):
 *   const O = Hanpan.createOnline({
 *     id: 'omok',                                  // 게임 폴더 이름. 방 주소 앞머리로도 쓴다
 *     seats: { host: 1, guest: 2, none: 0 },       // O.my 에 들어갈 값
 *     text: { host: '방장 · 흑(선공)', guest: '참가자 · 백(후공)', note: '방장이 흑, 참가자가 백입니다.' },
 *     isOnline: () => S.mode === 'online',
 *     setOnline: () => { S.mode = 'online'; },     // 초대 링크로 들어왔을 때 모드 전환
 *     onNewRoom: kind => resetBoard(),             // 'host' | 'guest' | 'left' — 새 판으로
 *     getState: () => ({ ... }),                   // 상대에게 보낼 판 상태 (JSON)
 *     onState: (g, firstSync) => { ... },          // 상대가 보낸 상태를 검증해서 반영
 *     render: () => render(), save: () => save(),
 *   });
 *   O.mountPanel(fieldset)  설정 패널에 방 만들기/참가 UI를 그린다
 *   O.boot(savedRoom)       초대 링크·저장된 방이 있으면 접속을 시작하고 true
 *   O.send()                내 수를 둔 뒤 호출
 *   O.leave()               온라인 모드를 떠날 때
 *   O.statusText()          연결 중 안내 문구 (대국 가능 상태면 null)
 *   O.renderPanel(online)   render() 안에서 호출
 *   O.status === 'live' && 차례 === O.my 일 때만 둘 수 있게 하면 된다.
 */
(function () {
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  function makeCode() {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  function createOnline(cfg) {
    const prefix = cfg.id + '-hanpan-';
    const tag = '[' + cfg.id + ']';
    const O = {
      status: 'off',            // off | opening | waiting | joining | live | lost | error
      peer: null, conn: null, role: null, code: '', my: cfg.seats.none,
      flash: '', retries: 0, timer: 0, resume: false, wasLive: false, synced: false
    };
    let panel = null;

    function leaveRoom() {
      clearTimeout(O.timer);
      const peer = O.peer;
      O.peer = null; O.conn = null;
      if (peer) { try { peer.destroy(); } catch (e) {} }
      O.status = 'off'; O.role = null; O.code = ''; O.my = cfg.seats.none;
      O.flash = ''; O.retries = 0; O.resume = false; O.wasLive = false; O.synced = false;
      if (cfg.onLeave) cfg.onLeave();
    }
    function failOnline(text) {
      leaveRoom();
      O.status = 'error';
      O.flash = text;
      cfg.render();
      cfg.save();
    }
    function newPeer(id) {
      if (typeof Peer === 'undefined') { failOnline('연결 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.'); return null; }
      const peer = id ? new Peer(id) : new Peer();
      O.peer = peer;
      peer.on('disconnected', () => { if (O.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
      peer.on('error', err => { if (O.peer === peer) onPeerError(err); });
      return peer;
    }
    function hostRoom(code, resume) {
      const retries = resume ? O.retries : 0;
      leaveRoom();
      O.role = 'host'; O.my = cfg.seats.host; O.code = code || makeCode();
      O.resume = !!resume; O.retries = retries; O.status = 'opening';
      if (!resume) cfg.onNewRoom('host');
      const peer = newPeer(prefix + O.code);
      if (!peer) return;
      peer.on('open', () => {
        if (O.peer !== peer) return;
        O.retries = 0;
        if (O.status === 'opening') O.status = 'waiting';
        cfg.render();
      });
      peer.on('connection', conn => {
        if (O.peer !== peer) return;
        // 새로 들어온 연결이 이전 연결을 대신한다 (상대의 재접속)
        const old = O.conn;
        wire(conn);
        if (old && old !== conn) { try { old.close(); } catch (e) {} }
      });
      cfg.render();
      cfg.save();
    }
    function joinRoom(code) {
      leaveRoom();
      O.role = 'guest'; O.my = cfg.seats.guest; O.code = code; O.status = 'joining';
      cfg.onNewRoom('guest');
      const peer = newPeer();
      if (!peer) return;
      peer.on('open', () => { if (O.peer === peer) wire(peer.connect(prefix + code, { reliable: true })); });
      cfg.render();
      cfg.save();
    }
    function wire(conn) {
      O.conn = conn;
      O.synced = O.role === 'host';
      conn.on('open', () => {
        if (O.conn !== conn) return;
        O.status = 'live'; O.flash = ''; O.retries = 0; O.wasLive = true;
        if (O.role === 'host') sendState();
        cfg.render();
      });
      conn.on('data', msg => { if (O.conn === conn) onPeerData(msg); });
      conn.on('close', () => { if (O.conn === conn) { O.conn = null; onConnLost(); } });
      conn.on('error', err => console.warn(tag, 'connection error', err));
    }
    function onConnLost() {
      if (O.role === 'host') {
        O.status = 'waiting';
        O.flash = '상대 연결이 끊겼습니다. 같은 방 코드로 다시 들어오면 이어서 합니다.';
        cfg.render();
      } else {
        O.status = 'lost';
        retryJoin();
      }
    }
    function retryJoin() {
      clearTimeout(O.timer);
      if (O.retries >= 5) { failOnline('방과 연결이 끊겼습니다. 방장이 페이지를 열어 둔 상태인지 확인하고 다시 참가해 주세요.'); return; }
      O.retries++;
      cfg.render();
      const peer = O.peer, code = O.code;
      O.timer = setTimeout(() => {
        if (O.peer !== peer || !peer || peer.destroyed) return;
        wire(peer.connect(prefix + code, { reliable: true }));
      }, 3000);
    }
    function onPeerError(err) {
      const type = err && err.type;
      console.warn(tag, 'peer error:', type, err && err.message);
      if (type === 'unavailable-id') {
        // 새로고침 직후에는 이전 세션이 잠깐 남아 있을 수 있다
        if (O.resume && O.retries < 4) {
          const code = O.code;
          O.retries++;
          O.timer = setTimeout(() => { if (O.code === code && O.role === 'host') hostRoom(code, true); }, 2500);
        } else {
          hostRoom(null, false);
        }
      } else if (type === 'peer-unavailable') {
        if (O.wasLive) retryJoin();
        else failOnline('방 ' + O.code + '을(를) 찾지 못했습니다. 코드가 맞는지, 방장이 페이지를 열어 두었는지 확인해 주세요.');
      } else if (type === 'browser-incompatible') {
        failOnline('이 브라우저는 온라인 대전(WebRTC)을 지원하지 않습니다.');
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        failOnline('연결 서버에 접속하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
      }
    }
    function sendState() {
      if (!O.conn || !O.conn.open) return;
      O.conn.send({ t: 'state', g: JSON.parse(JSON.stringify(cfg.getState())) });
    }
    function onPeerData(msg) {
      if (!msg || msg.t !== 'state' || !msg.g) return;
      const firstSync = !O.synced;
      O.synced = true;
      cfg.onState(msg.g, firstSync);
    }
    async function copyInvite() {
      const isFile = location.protocol === 'file:';
      const text = isFile ? O.code : location.origin + location.pathname + '?room=' + O.code;
      try {
        await navigator.clipboard.writeText(text);
        O.flash = isFile ? '방 코드를 복사했습니다. 상대에게 보내 주세요.' : '초대 링크를 복사했습니다. 상대에게 보내 주세요.';
      } catch (e) {
        O.flash = '복사하지 못했습니다. 직접 보내 주세요: ' + text;
      }
      cfg.render();
    }

    // ---------- 설정 패널 ----------
    function mountPanel(fs) {
      fs.innerHTML =
        '<legend>온라인 방</legend>' +
        '<div data-o="lobby" style="display:grid;gap:10px">' +
          '<button type="button" class="btn" data-o="create">방 만들기</button>' +
          '<div class="join">' +
            '<input type="text" data-o="code" id="room-code" maxlength="6" placeholder="방 코드 6자리" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="방 코드">' +
            '<button type="button" class="btn" data-o="join">참가</button>' +
          '</div>' +
        '</div>' +
        '<div data-o="room" style="display:grid;gap:10px" hidden>' +
          '<p class="room-code"><span class="fine">방 코드</span><strong data-o="show"></strong></p>' +
          '<p class="fine" data-o="role"></p>' +
          '<div class="actions">' +
            '<button type="button" class="btn small" data-o="copy">초대 링크 복사</button>' +
            '<button type="button" class="btn small" data-o="leave">방 나가기</button>' +
          '</div>' +
        '</div>' +
        '<p class="fine" data-o="msg" role="status" style="color:var(--ink);font-weight:500" hidden></p>' +
        '<p class="fine" data-o="note"></p>';
      const q = name => fs.querySelector('[data-o="' + name + '"]');
      panel = { fs, lobby: q('lobby'), room: q('room'), show: q('show'), role: q('role'), copy: q('copy'), msg: q('msg'), code: q('code') };
      q('note').textContent = cfg.text.note + ' 두 브라우저가 직접 연결되므로 하는 동안에는 두 사람 모두 이 페이지를 열어 두어야 합니다.';
      const join = () => {
        const code = cleanCode(panel.code.value);
        if (code.length !== 6) { O.flash = '방 코드 6자리를 입력해 주세요.'; cfg.render(); return; }
        joinRoom(code);
      };
      q('create').addEventListener('click', () => hostRoom(null, false));
      q('join').addEventListener('click', join);
      panel.code.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
      q('copy').addEventListener('click', copyInvite);
      q('leave').addEventListener('click', () => { leaveRoom(); cfg.onNewRoom('left'); cfg.render(); cfg.save(); });
    }
    function renderPanel(online) {
      if (!panel) return;
      panel.fs.hidden = !online;
      const inRoom = online && O.status !== 'off' && O.status !== 'error';
      panel.lobby.hidden = inRoom;
      panel.room.hidden = !inRoom;
      panel.show.textContent = O.code;
      const linked = O.status === 'live';
      panel.role.textContent = O.role === 'host'
        ? cfg.text.host + (linked ? ' · 상대와 연결됨' : '')
        : cfg.text.guest + (linked ? ' · 방장과 연결됨' : '');
      panel.copy.hidden = O.role !== 'host';
      panel.copy.textContent = location.protocol === 'file:' ? '방 코드 복사' : '초대 링크 복사';
      panel.msg.textContent = O.flash;
      panel.msg.hidden = !O.flash;
    }
    function statusText() {
      switch (O.status) {
        case 'off': return '온라인 2인: 설정에서 방을 만들거나 방 코드로 참가하세요.';
        case 'error': return '온라인 연결에 실패했습니다. 설정의 안내를 확인해 주세요.';
        case 'opening': return '방을 여는 중…';
        case 'waiting': return '상대를 기다리는 중 — 방 코드 ' + O.code;
        case 'joining': return '방 ' + O.code + '에 연결하는 중…';
        case 'lost': return '연결이 끊겼습니다. 다시 연결하는 중… (' + O.retries + '/5)';
        default: return null;
      }
    }
    function boot(savedRoom) {
      const invited = cleanCode(new URLSearchParams(location.search).get('room'));
      if (invited.length === 6 && !(savedRoom && savedRoom.role === 'host' && savedRoom.code === invited)) {
        cfg.setOnline();
        joinRoom(invited);
        return true;
      }
      const code = savedRoom ? cleanCode(savedRoom.code) : '';
      if (cfg.isOnline() && code.length === 6) {
        if (savedRoom.role === 'host') hostRoom(code, true); else joinRoom(code);
        return true;
      }
      return false;
    }

    O.host = hostRoom;
    O.join = joinRoom;
    O.leave = leaveRoom;
    O.send = sendState;
    O.boot = boot;
    O.mountPanel = mountPanel;
    O.renderPanel = renderPanel;
    O.statusText = statusText;
    O.roomInfo = () => (O.code && O.role ? { code: O.code, role: O.role } : null);
    return O;
  }

  /* ---------- 여럿이 하는 방 (2~max 명) ----------
   *
   * 방장의 브라우저가 판을 쥐고, 참가자는 방장에게만 연결된다(별 모양).
   * 참가자는 자기 수(action)를 방장에게 보내고, 방장이 규칙대로 반영한 뒤 판 전체를 모두에게 돌린다.
   * 대기실에서 사람이 모이면 방장이 "시작"을 누른다. 빈자리는 AI 로 채울 수 있고,
   * 하는 도중 끊긴 사람의 자리는 돌아올 때까지 방장 쪽 AI 가 대신 둔다(게임 쪽에서 P.isOn 으로 판단).
   *
   *   const P = Hanpan.createParty({
   *     id: 'onecard', max: 4, min: 2,
   *     isOnline, setOnline, onNewRoom: kind => {...}, render, save,
   *     getState: () => G,                 // 방장: 모두에게 돌릴 판 상태
   *     onState: g => {...},               // 참가자: 방장이 보낸 판 (검증 후 반영)
   *     onAction: (key, a) => {...},       // 방장: key 자리 사람이 보낸 수 (차례·규칙 검증은 게임이)
   *     onStart: () => {...},              // 방장이 시작을 눌렀다 → P.lineup() 으로 판을 돌리고 P.send()
   *     onRoster: () => {...},             // 방장: 누가 들어오거나 끊겼다
   *   });
   *   P.me        내 자리표(key). 판의 players[i].key 와 맞춰 본다
   *   P.members   [{ key, name, kind: 'host'|'guest'|'ai', on }]
   *   P.phase     'lobby' | 'play'
   *   P.lineup()  다음 판에 앉을 사람들 (연결된 사람 + AI, 최대 max)
   *   P.act(a)    참가자: 내 수 보내기      P.send()  방장: 판 돌리기
   */
  function createParty(cfg) {
    const prefix = cfg.id + '-hanpan-p-';
    const tag = '[' + cfg.id + ']';
    const max = cfg.max || 4, min = cfg.min || 2;
    const P = {
      status: 'off',            // off | opening | joining | live | lost | error
      peer: null, role: null, code: '', me: '', phase: 'lobby', members: [], name: '',
      flash: '', retries: 0, timer: 0, resume: false, wasLive: false, max, min
    };
    let pid = '', nextKey = 1, hostConn = null, panel = null;
    const conns = new Map();      // 방장: key → 연결
    const seen = new Map();       // 연결 → 마지막으로 소식이 온 시각. 탭을 그냥 닫으면 close 가 안 올 수 있어 맥박으로 확인한다
    const BEAT = 3000, DEAD = 12000;
    let beat = 0;
    const secrets = new Map();    // 방장: key → 그 사람의 비밀 표(pid). 재접속 때 같은 자리로 돌려보낸다

    const cleanName = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 8);
    const cleanKey = v => (typeof v === 'string' && /^[a-z]\d{1,6}$/.test(v) ? v : '');
    const cleanPid = v => (typeof v === 'string' && /^[A-Za-z0-9]{8,32}$/.test(v) ? v : '');
    const copy = v => JSON.parse(JSON.stringify(v));
    function makePid() {
      let c = '';
      for (let i = 0; i < 16; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      return c;
    }
    function cleanMembers(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set(), out = [];
      for (const m of list.slice(0, max * 2)) {
        const key = cleanKey(m && m.key), kind = m && ['host', 'guest', 'ai'].includes(m.kind) ? m.kind : '';
        if (!key || !kind || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name: cleanName(m.name), kind, on: !!m.on });
      }
      return out;
    }
    const member = key => P.members.find(m => m.key === key);
    const nameOf = m => (m ? m.name || (m.kind === 'host' ? '방장' : m.kind === 'ai' ? 'AI' : '손님') : '');
    const isOn = key => { const m = member(key); return !!(m && m.on); };
    const humans = () => P.members.filter(m => m.kind !== 'ai');
    function lineup() {
      const people = P.members.filter(m => m.kind !== 'ai' && m.on).slice(0, max);
      const ais = P.members.filter(m => m.kind === 'ai').slice(0, max - people.length);
      return P.members.filter(m => people.includes(m) || ais.includes(m)).map(m => ({ key: m.key, name: m.name, kind: m.kind }));
    }
    // 끊긴 사람과 넘치는 AI 를 명단에서 정리한다 (판을 새로 돌리기 직전에)
    function prune() {
      const keep = new Set(lineup().map(m => m.key));
      for (const m of P.members) if (!keep.has(m.key)) { secrets.delete(m.key); const c = conns.get(m.key); conns.delete(m.key); if (c) { try { c.close(); } catch (e) {} } }
      P.members = P.members.filter(m => keep.has(m.key));
    }

    function pulse() {
      const now = Date.now();
      if (P.role === 'host') {
        conns.forEach((c, key) => {
          if (now - (seen.get(c) || now) > DEAD) { conns.delete(key); seen.delete(c); try { c.close(); } catch (e) {} dropped(key); }
          else post(c, { t: 'ping' });
        });
      } else if (P.role === 'guest' && hostConn && P.status === 'live' && now - (seen.get(hostConn) || now) > DEAD) {
        const c = hostConn;
        hostConn = null; seen.delete(c);
        try { c.close(); } catch (e) {}
        P.status = 'lost';
        retryJoin();
      }
    }
    function leaveRoom() {
      clearTimeout(P.timer);
      clearInterval(beat); beat = 0;
      if (P.role === 'guest') post(hostConn, { t: 'bye' });
      const peer = P.peer;
      P.peer = null; hostConn = null; conns.clear(); secrets.clear(); seen.clear();
      if (peer) { try { peer.destroy(); } catch (e) {} }
      P.status = 'off'; P.role = null; P.code = ''; P.me = ''; P.phase = 'lobby'; P.members = [];
      P.flash = ''; P.retries = 0; P.resume = false; P.wasLive = false;
      pid = ''; nextKey = 1;
      if (cfg.onLeave) cfg.onLeave();
    }
    function failOnline(text) {
      leaveRoom();
      P.status = 'error';
      P.flash = text;
      cfg.render();
      cfg.save();
    }
    function newPeer(id) {
      if (typeof Peer === 'undefined') { failOnline('연결 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.'); return null; }
      const peer = id ? new Peer(id) : new Peer();
      P.peer = peer;
      peer.on('disconnected', () => { if (P.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
      peer.on('error', err => { if (P.peer === peer) onPeerError(err); });
      return peer;
    }
    const post = (conn, msg) => { if (conn && conn.open) { try { conn.send(msg); } catch (e) { console.warn(tag, 'send failed', e); } } };
    const roomMsg = () => ({ t: 'room', members: copy(P.members), phase: P.phase });
    function broadcast(msg) { conns.forEach(c => post(c, msg)); }
    function changed() {
      broadcast(roomMsg());
      if (cfg.onRoster) cfg.onRoster();
      cfg.render();
      cfg.save();
    }

    // ---------- 방장 ----------
    function snapshot() {
      return { members: copy(P.members), secrets: Array.from(secrets.entries()), phase: P.phase, next: nextKey, name: P.name };
    }
    function restore(d) {
      if (!d || typeof d !== 'object') return false;
      const list = cleanMembers(d.members);
      if (!list.length || list[0].kind !== 'host' || list.filter(m => m.kind === 'host').length !== 1) return false;
      P.members = list.map(m => Object.assign(m, { on: m.kind !== 'guest' }));   // 참가자는 다시 들어와야 연결로 친다
      secrets.clear();
      if (Array.isArray(d.secrets)) for (const e of d.secrets) { if (Array.isArray(e) && cleanKey(e[0]) && cleanPid(e[1]) && member(e[0])) secrets.set(e[0], e[1]); }
      P.members = P.members.filter(m => m.kind !== 'guest' || secrets.has(m.key));
      P.phase = d.phase === 'play' ? 'play' : 'lobby';
      nextKey = Math.max(Number.isInteger(d.next) ? d.next : 1, 1 + Math.max(0, ...P.members.map(m => Number(m.key.slice(1)) || 0)));
      return true;
    }
    function hostRoom(code, resume, saved) {
      const retries = resume ? P.retries : 0;
      const keep = resume ? (saved || snapshot()) : null;
      const name = P.name;
      leaveRoom();
      P.name = name;
      P.role = 'host'; P.code = code || makeCode();
      P.resume = !!resume; P.retries = retries; P.status = 'opening';
      if (!(keep && restore(keep))) {
        P.members = [{ key: 'h0', name: cleanName(P.name), kind: 'host', on: true }];
        P.phase = 'lobby';
        if (resume) cfg.onNewRoom('host');
      }
      P.members[0].name = cleanName(P.name);
      P.me = P.members[0].key;
      if (!resume) cfg.onNewRoom('host');
      const peer = newPeer(prefix + P.code);
      if (!peer) return;
      beat = setInterval(pulse, BEAT);
      peer.on('open', () => {
        if (P.peer !== peer) return;
        P.retries = 0;
        P.status = 'live';
        cfg.render();
      });
      peer.on('connection', conn => {
        if (P.peer !== peer) return;
        let key = '';
        conn.on('data', msg => {
          if (P.peer !== peer || !msg || typeof msg !== 'object') return;
          seen.set(conn, Date.now());
          if (msg.t === 'hello') { key = admit(conn, msg) || key; return; }
          if (!key || conns.get(key) !== conn) return;
          if (msg.t === 'bye') { conns.delete(key); seen.delete(conn); dropped(key); try { conn.close(); } catch (e) {} }
          else if (msg.t === 'act') cfg.onAction(key, msg.a);
          else if (msg.t === 'name') { const m = member(key); if (m) { m.name = cleanName(msg.name); changed(); } }
        });
        conn.on('close', () => { if (P.peer === peer && key && conns.get(key) === conn) { conns.delete(key); dropped(key); } });
        conn.on('error', err => console.warn(tag, 'connection error', err));
      });
      cfg.render();
      cfg.save();
    }
    function admit(conn, msg) {
      const p = cleanPid(msg.pid);
      if (!p) { try { conn.close(); } catch (e) {} return ''; }
      let key = '';
      secrets.forEach((v, k) => { if (v === p) key = k; });
      let m = key ? member(key) : null;
      if (!m) {
        if (humans().length >= max) {
          post(conn, { t: 'full' });
          setTimeout(() => { try { conn.close(); } catch (e) {} }, 500);
          return '';
        }
        // 사람이 AI 보다 먼저다: 대기실에서 자리가 꽉 찼으면 AI 하나가 비켜 준다
        if (P.phase === 'lobby' && P.members.length >= max) { const i = P.members.map(x => x.kind).lastIndexOf('ai'); if (i >= 0) P.members.splice(i, 1); }
        key = 'p' + (nextKey++);
        secrets.set(key, p);
        m = { key, name: cleanName(msg.name), kind: 'guest', on: true };
        P.members.push(m);
        P.flash = nameOf(m) + ' 님이 들어왔습니다.';
      } else {
        m.on = true;
        if (cleanName(msg.name)) m.name = cleanName(msg.name);
        P.flash = nameOf(m) + ' 님이 다시 들어왔습니다.';
      }
      const old = conns.get(key);
      conns.set(key, conn);
      seen.set(conn, Date.now());
      if (old && old !== conn) { try { old.close(); } catch (e) {} }
      post(conn, { t: 'welcome', you: key });
      if (P.phase === 'play') post(conn, { t: 'state', g: copy(cfg.getState()) });
      changed();
      return key;
    }
    function dropped(key) {
      const m = member(key);
      if (!m) return;
      if (P.phase === 'lobby') {
        P.members = P.members.filter(x => x !== m);
        secrets.delete(key);
        P.flash = nameOf(m) + ' 님이 나갔습니다.';
      } else {
        m.on = false;
        P.flash = nameOf(m) + ' 님 연결이 끊겼습니다. 돌아올 때까지 AI 가 대신 둡니다.';
      }
      changed();
    }
    function addAI() {
      if (P.role !== 'host' || P.members.length >= max) return;
      P.members.push({ key: 'a' + (nextKey++), name: '', kind: 'ai', on: true });
      changed();
    }
    function removeAI() {
      if (P.role !== 'host') return;
      const i = P.members.map(m => m.kind).lastIndexOf('ai');
      if (i < 0) return;
      P.members.splice(i, 1);
      changed();
    }
    function start() {
      if (P.role !== 'host' || P.status !== 'live' || lineup().length < min) return;
      prune();
      P.phase = 'play';
      P.flash = '';
      cfg.onStart();
      changed();
    }
    function sendState() {
      if (P.role !== 'host' || !conns.size) return;
      broadcast({ t: 'state', g: copy(cfg.getState()) });
    }

    // ---------- 참가자 ----------
    function joinRoom(code, savedPid) {
      const name = P.name;
      leaveRoom();
      P.name = name;
      P.role = 'guest'; P.code = code; P.status = 'joining';
      pid = cleanPid(savedPid) || makePid();
      cfg.onNewRoom('guest');
      const peer = newPeer();
      if (!peer) return;
      beat = setInterval(pulse, BEAT);
      peer.on('open', () => { if (P.peer === peer) wire(peer.connect(prefix + code, { reliable: true })); });
      cfg.render();
      cfg.save();
    }
    function wire(conn) {
      hostConn = conn;
      seen.set(conn, Date.now());
      conn.on('open', () => { if (hostConn === conn) post(conn, { t: 'hello', pid, name: cleanName(P.name) }); });
      conn.on('data', msg => { if (hostConn === conn) onHostData(msg); });
      conn.on('close', () => { if (hostConn === conn) { hostConn = null; P.status = 'lost'; retryJoin(); } });
      conn.on('error', err => console.warn(tag, 'connection error', err));
    }
    function onHostData(msg) {
      if (!msg || typeof msg !== 'object') return;
      seen.set(hostConn, Date.now());
      if (msg.t === 'ping') { post(hostConn, { t: 'pong' }); return; }
      if (msg.t === 'welcome') {
        if (!cleanKey(msg.you)) return;
        P.me = msg.you; P.status = 'live'; P.flash = ''; P.retries = 0; P.wasLive = true;
        cfg.render(); cfg.save();
      } else if (msg.t === 'room') {
        P.members = cleanMembers(msg.members);
        P.phase = msg.phase === 'play' ? 'play' : 'lobby';
        if (cfg.onRoster) cfg.onRoster();
        cfg.render();
      } else if (msg.t === 'state') {
        if (msg.g) cfg.onState(msg.g);
      } else if (msg.t === 'full') {
        failOnline('방이 가득 찼습니다 (최대 ' + max + '명).');
      }
    }
    function retryJoin() {
      clearTimeout(P.timer);
      if (P.retries >= 5) { failOnline('방과 연결이 끊겼습니다. 방장이 페이지를 열어 둔 상태인지 확인하고 다시 참가해 주세요.'); return; }
      P.retries++;
      cfg.render();
      const peer = P.peer, code = P.code;
      P.timer = setTimeout(() => {
        if (P.peer !== peer || !peer || peer.destroyed) return;
        wire(peer.connect(prefix + code, { reliable: true }));
      }, 3000);
    }
    function act(a) { if (P.role === 'guest') post(hostConn, { t: 'act', a }); }

    function onPeerError(err) {
      const type = err && err.type;
      console.warn(tag, 'peer error:', type, err && err.message);
      if (type === 'unavailable-id') {
        // 새로고침 직후에는 이전 세션이 잠깐 남아 있을 수 있다
        if (P.resume && P.retries < 4) {
          const code = P.code;
          P.retries++;
          P.timer = setTimeout(() => { if (P.code === code && P.role === 'host') hostRoom(code, true); }, 2500);
        } else {
          hostRoom(null, false);
        }
      } else if (type === 'peer-unavailable') {
        if (P.wasLive) retryJoin();
        else failOnline('방 ' + P.code + '을(를) 찾지 못했습니다. 코드가 맞는지, 방장이 페이지를 열어 두었는지 확인해 주세요.');
      } else if (type === 'browser-incompatible') {
        failOnline('이 브라우저는 온라인 대전(WebRTC)을 지원하지 않습니다.');
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        failOnline('연결 서버에 접속하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
      }
    }
    function setName(v) {
      P.name = cleanName(v);
      if (P.role === 'host' && P.members[0]) { P.members[0].name = P.name; changed(); }
      else if (P.role === 'guest' && P.status === 'live') { post(hostConn, { t: 'name', name: P.name }); cfg.save(); }
      else cfg.save();
    }
    async function copyInvite() {
      const isFile = location.protocol === 'file:';
      const text = isFile ? P.code : location.origin + location.pathname + '?room=' + P.code;
      try {
        await navigator.clipboard.writeText(text);
        P.flash = isFile ? '방 코드를 복사했습니다. 친구들에게 보내 주세요.' : '초대 링크를 복사했습니다. 친구들에게 보내 주세요.';
      } catch (e) {
        P.flash = '복사하지 못했습니다. 직접 보내 주세요: ' + text;
      }
      cfg.render();
    }

    // ---------- 설정 패널 ----------
    function mountPanel(fs) {
      fs.innerHTML =
        '<legend>온라인 방 (최대 ' + max + '명)</legend>' +
        '<div class="join"><input type="text" data-o="name" class="party-name" maxlength="8" placeholder="내 이름 (8자까지)" autocomplete="off" spellcheck="false" aria-label="내 이름"></div>' +
        '<div data-o="lobby" style="display:grid;gap:10px">' +
          '<button type="button" class="btn" data-o="create">방 만들기</button>' +
          '<div class="join">' +
            '<input type="text" data-o="code" id="room-code" maxlength="6" placeholder="방 코드 6자리" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="방 코드">' +
            '<button type="button" class="btn" data-o="join">참가</button>' +
          '</div>' +
        '</div>' +
        '<div data-o="room" style="display:grid;gap:10px" hidden>' +
          '<p class="room-code"><span class="fine">방 코드</span><strong data-o="show"></strong></p>' +
          '<ul class="party-list" data-o="list"></ul>' +
          '<div class="actions" data-o="hostrow">' +
            '<button type="button" class="btn small" data-o="start">시작</button>' +
            '<button type="button" class="btn small" data-o="addai">AI 추가</button>' +
            '<button type="button" class="btn small" data-o="delai">AI 빼기</button>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="btn small" data-o="copy">초대 링크 복사</button>' +
            '<button type="button" class="btn small" data-o="leave">방 나가기</button>' +
          '</div>' +
        '</div>' +
        '<p class="fine" data-o="msg" role="status" style="color:var(--ink);font-weight:500" hidden></p>' +
        '<p class="fine" data-o="note"></p>';
      const q = name => fs.querySelector('[data-o="' + name + '"]');
      panel = { fs, lobby: q('lobby'), room: q('room'), show: q('show'), list: q('list'), hostrow: q('hostrow'), start: q('start'), addai: q('addai'), delai: q('delai'), copy: q('copy'), msg: q('msg'), code: q('code'), name: q('name') };
      q('note').textContent = (cfg.note ? cfg.note + ' ' : '') + '방장의 브라우저가 판을 돌리므로 하는 동안 방장은 이 페이지를 열어 두어야 합니다.';
      const join = () => {
        const code = cleanCode(panel.code.value);
        if (code.length !== 6) { P.flash = '방 코드 6자리를 입력해 주세요.'; cfg.render(); return; }
        joinRoom(code);
      };
      panel.name.value = P.name;
      panel.name.addEventListener('change', () => setName(panel.name.value));
      q('create').addEventListener('click', () => { P.name = cleanName(panel.name.value); hostRoom(null, false); });
      q('join').addEventListener('click', () => { P.name = cleanName(panel.name.value); join(); });
      panel.code.addEventListener('keydown', e => { if (e.key === 'Enter') { P.name = cleanName(panel.name.value); join(); } });
      panel.start.addEventListener('click', start);
      panel.addai.addEventListener('click', addAI);
      panel.delai.addEventListener('click', removeAI);
      panel.copy.addEventListener('click', copyInvite);
      q('leave').addEventListener('click', () => { leaveRoom(); cfg.onNewRoom('left'); cfg.render(); cfg.save(); });
    }
    function renderPanel(online) {
      if (!panel) return;
      panel.fs.hidden = !online;
      const inRoom = online && P.status !== 'off' && P.status !== 'error';
      panel.lobby.hidden = inRoom;
      panel.room.hidden = !inRoom;
      panel.show.textContent = P.code;
      if (document.activeElement !== panel.name) panel.name.value = P.name;
      const host = P.role === 'host';
      panel.list.textContent = '';
      P.members.forEach(m => {
        const li = document.createElement('li');
        const b = document.createElement('b'); b.textContent = nameOf(m);
        const tags = [];
        if (m.key === P.me) tags.push('나');
        if (m.kind === 'host' && m.name) tags.push('방장');
        if (m.kind === 'guest' && !m.on) tags.push('연결 끊김');
        if (cfg.memberNote) { const n = cfg.memberNote(m); if (n) tags.push(n); }
        li.append(b);
        if (tags.length) { const s = document.createElement('span'); s.textContent = tags.join(' · '); li.append(s); }
        panel.list.appendChild(li);
      });
      if (inRoom && !P.members.length) { const li = document.createElement('li'); li.textContent = '연결하는 중…'; panel.list.appendChild(li); }
      panel.hostrow.hidden = !host;
      const n = lineup().length;
      panel.start.hidden = P.phase !== 'lobby';
      panel.start.textContent = '시작 (' + n + '명)';
      panel.start.disabled = P.status !== 'live' || n < min;
      panel.addai.disabled = P.members.length >= max;
      panel.delai.disabled = !P.members.some(m => m.kind === 'ai');
      panel.copy.textContent = location.protocol === 'file:' ? '방 코드 복사' : '초대 링크 복사';
      panel.msg.textContent = P.flash;
      panel.msg.hidden = !P.flash;
    }
    function statusText() {
      switch (P.status) {
        case 'off': return '온라인: 설정에서 방을 만들거나 방 코드로 참가하세요.';
        case 'error': return '온라인 연결에 실패했습니다. 설정의 안내를 확인해 주세요.';
        case 'opening': return '방을 여는 중…';
        case 'joining': return '방 ' + P.code + '에 연결하는 중…';
        case 'lost': return '연결이 끊겼습니다. 다시 연결하는 중… (' + P.retries + '/5)';
        default: return null;
      }
    }
    function boot(savedRoom, savedName) {
      P.name = cleanName(savedName);
      if (panel) panel.name.value = P.name;
      const sr = savedRoom && typeof savedRoom === 'object' ? savedRoom : null;
      const code = sr ? cleanCode(sr.code) : '';
      const invited = cleanCode(new URLSearchParams(location.search).get('room'));
      if (invited.length === 6 && !(sr && sr.role === 'host' && code === invited)) {
        cfg.setOnline();
        joinRoom(invited, sr && sr.role === 'guest' && code === invited ? sr.pid : '');
        return true;
      }
      if (cfg.isOnline() && code.length === 6) {
        if (sr.role === 'host') hostRoom(code, true, sr.host); else joinRoom(code, sr.pid);
        return true;
      }
      return false;
    }
    function roomInfo() {
      if (!P.code || !P.role) return null;
      return P.role === 'host' ? { code: P.code, role: 'host', host: snapshot() } : { code: P.code, role: 'guest', pid };
    }

    window.addEventListener('pagehide', () => { if (P.role === 'guest') post(hostConn, { t: 'bye' }); });
    Object.assign(P, {
      host: hostRoom, join: joinRoom, leave: leaveRoom, send: sendState, act, boot, start, addAI, removeAI, lineup,
      prune: () => { if (P.role === 'host') { prune(); changed(); } },
      isOn, nameOf, setName, copyInvite, mountPanel, renderPanel, statusText, roomInfo
    });
    return P;
  }

  window.Hanpan = Object.assign(window.Hanpan || {}, { createOnline, createParty });
})();
