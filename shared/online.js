/* 한 판 놀이방 — 온라인 2인 공용 모듈 (PeerJS WebRTC)
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

  window.Hanpan = Object.assign(window.Hanpan || {}, { createOnline });
})();
