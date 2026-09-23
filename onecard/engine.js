/* 원카드 규칙 엔진 — 화면과 무관한 순수 상태 함수. index.html 과 node 테스트가 같이 쓴다.
 * 카드 id: 0~51 = 무늬(0♠ 1♥ 2♦ 3♣)*13 + 순위(0=A … 12=K), 52 = 컬러 조커(+5), 53 = 흑 조커(+7)
 * 규칙(2인): 같은 무늬·같은 숫자를 낸다. 2 = +2, A = +3, 조커 = +5/+7. 공격은 공격 카드로 되받아 누적.
 *   공격은 같거나 더 센 공격 카드로만 막는다. J·K = 한 번 더, 7 = 무늬 바꾸기, 조커는 아무 때나(공격 중엔 공격으로) 낼 수 있다.
 *   한 장 남기면 '원카드' 선언을 해야 하고, 안 하고 차례를 넘기면 벌칙 1장. 손패 20장 초과면 파산. */
(function (root) {
  const SUITS = ['♠', '♥', '♦', '♣'], SUIT_NAME = ['스페이드', '하트', '다이아', '클로버'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const JOKER_C = 52, JOKER_B = 53, MAX_HAND = 20, START_HAND = 7;
  const suitOf = id => (id >= 52 ? -1 : Math.floor(id / 13));
  const rankOf = id => (id >= 52 ? -1 : id % 13);
  const isJoker = id => id >= 52;
  const attackOf = id => (id === JOKER_B ? 7 : id === JOKER_C ? 5 : rankOf(id) === 0 ? 3 : rankOf(id) === 1 ? 2 : 0);
  const name = id => (id === JOKER_B ? '흑 조커' : id === JOKER_C ? '컬러 조커' : SUITS[suitOf(id)] + RANKS[rankOf(id)]);

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function deal(seed, first) {
    const r = rng(seed);
    let deck;
    for (let tries = 0; tries < 50; tries++) {
      deck = Array.from({ length: 54 }, (_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      const top = deck[START_HAND * 2];
      if (!isJoker(top) && attackOf(top) === 0 && rankOf(top) !== 6 && rankOf(top) !== 9 && rankOf(top) !== 12) break;   // 첫 장은 평범한 카드
    }
    const hands = [deck.slice(0, START_HAND), deck.slice(START_HAND, START_HAND * 2)];
    const pile = [deck[START_HAND * 2]];
    return {
      seed, first, turn: first, hands, pile, draw: deck.slice(START_HAND * 2 + 1).reverse(),   // pop() 이 다음 장
      suit: suitOf(pile[0]), attack: 0, declared: [false, false], stage: 'play',   // play | suit(무늬 고르기) | over
      over: false, winner: -1, why: '', log: [], last: null, drawn: 0
    };
  }
  const top = G => G.pile[G.pile.length - 1];
  // 더미가 비면 바닥의 맨 위 한 장만 남기고 섞어 더미로 (시드 난수라 두 화면이 같다)
  function refill(G) {
    if (G.draw.length) return true;
    if (G.pile.length <= 1) return false;
    const keep = G.pile.pop(), rest = G.pile.splice(0);
    G.pile.push(keep);
    const r = rng((G.seed + G.log.length * 7919) >>> 0);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    G.draw = rest;
    return true;
  }
  function canPlay(G, id) {
    if (G.stage !== 'play' || G.over) return false;
    const t = top(G);
    // 공격은 같거나 더 센 공격 카드로만 막는다 (2 → 2·A·조커, A → A·조커, 컬러 조커 → 흑 조커, 흑 조커는 못 막음)
    if (G.attack > 0) return attackOf(id) > 0 && attackOf(id) >= attackOf(t) && (isJoker(id) || isJoker(t) || suitOf(id) === G.suit || rankOf(id) === rankOf(t));
    if (isJoker(id)) return true;
    if (isJoker(t)) return true;                                  // 조커 위엔 아무 카드나
    return suitOf(id) === G.suit || rankOf(id) === rankOf(t);
  }
  function playable(G, team) { return G.hands[team].filter(id => canPlay(G, id)); }
  function endTurn(G, t) {
    // 한 장 남기고 선언을 안 했으면 벌칙 1장
    if (G.hands[t].length === 1 && !G.declared[t]) {
      if (refill(G)) { G.hands[t].push(G.draw.pop()); G.log.push({ t, s: '원카드 선언 안 함 · 벌칙 1장' }); }
    }
    if (G.hands[t].length !== 1) G.declared[t] = false;
    G.turn = 1 - t;
    G.stage = 'play';
  }
  function finishIfOver(G, t) {
    if (G.hands[t].length === 0) { G.over = true; G.winner = t; G.stage = 'over'; G.why = '손패를 다 냈습니다'; G.log.push({ t, s: '마지막 카드 · 승리' }); return true; }
    if (G.hands[t].length > MAX_HAND) { G.over = true; G.winner = 1 - t; G.stage = 'over'; G.why = '손패가 ' + MAX_HAND + '장을 넘어 파산'; G.log.push({ t, s: '파산 (' + G.hands[t].length + '장)' }); return true; }
    return false;
  }
  function play(G, id, newSuit) {
    const t = G.turn;
    if (!G.hands[t].includes(id) || !canPlay(G, id)) return false;
    G.hands[t].splice(G.hands[t].indexOf(id), 1);
    G.pile.push(id);
    const parts = [name(id)];
    if (!isJoker(id)) G.suit = suitOf(id);
    const atk = attackOf(id);
    if (atk) { G.attack += atk; parts.push('공격 +' + atk + ' (누적 ' + G.attack + ')'); }
    G.last = { t, id, type: 'play' };
    if (finishIfOver(G, t)) { G.log.push({ t, s: parts.join(' · ') }); return true; }
    const r = rankOf(id);
    if (r === 6 && !atk) {                                        // 7: 무늬 고르기
      if (newSuit === undefined) { G.stage = 'suit'; G.log.push({ t, s: parts.join(' · ') + ' · 무늬 고르는 중' }); return true; }
      G.suit = newSuit; parts.push(SUIT_NAME[newSuit] + '로 바꿈');
    }
    if (isJoker(id)) G.suit = -1;                                 // 조커 위엔 아무 무늬
    G.log.push({ t, s: parts.join(' · ') });
    if (r === 10 || r === 12) { G.declared[t] = G.hands[t].length === 1 ? G.declared[t] : false; G.log.push({ t, s: (r === 10 ? 'J' : 'K') + ' · 한 번 더' }); G.stage = 'play'; return true; }   // 한 번 더
    endTurn(G, t);
    return true;
  }
  function chooseSuit(G, s) {
    if (G.stage !== 'suit' || !(s >= 0 && s <= 3)) return false;
    const t = G.turn;
    G.suit = s;
    G.log.push({ t, s: SUIT_NAME[s] + '로 바꿈' });
    endTurn(G, t);
    return true;
  }
  // 못 내서(또는 안 내고) 먹기: 공격 중이면 누적만큼, 아니면 1장
  function drawCards(G) {
    if (G.stage !== 'play' || G.over) return false;
    const t = G.turn, n = G.attack > 0 ? G.attack : 1;
    let got = 0;
    for (let i = 0; i < n; i++) { if (!refill(G)) break; G.hands[t].push(G.draw.pop()); got++; }
    G.last = { t, id: -1, type: 'draw', n: got };
    G.log.push({ t, s: (G.attack > 0 ? '공격 ' + G.attack + '장 먹음' : '한 장 먹음') + (got < n ? ' (더미 부족, ' + got + '장)' : '') });
    G.attack = 0;
    G.drawn++;
    if (finishIfOver(G, t)) return true;
    endTurn(G, t);
    return true;
  }
  function declare(G) {
    const t = G.turn;
    if (G.over || G.hands[t].length > 2) return false;           // 두 장 이하일 때 미리 선언 가능
    if (G.declared[t]) return false;
    G.declared[t] = true;
    G.log.push({ t, s: '원카드!' });
    return true;
  }

  // ---------- AI ----------
  function aiMove(G, level) {
    const t = G.turn, hand = G.hands[t], opp = G.hands[1 - t];
    if (G.stage === 'suit') {                                     // 손에 가장 많은 무늬
      const cnt = [0, 0, 0, 0]; hand.forEach(id => { if (!isJoker(id)) cnt[suitOf(id)]++; });
      return { type: 'suit', suit: cnt.indexOf(Math.max(...cnt)) };
    }
    const opts = playable(G, t);
    if (!opts.length) return { type: 'draw' };
    const cnt = [0, 0, 0, 0]; hand.forEach(id => { if (!isJoker(id)) cnt[suitOf(id)]++; });
    const score = id => {
      let s = 0;
      const a = attackOf(id), r = rankOf(id);
      if (G.attack > 0) s += 10 + a;                              // 공격은 되받는다
      else if (a) s += opp.length <= 2 ? 8 + a : 2 + a * 0.4;     // 상대가 나가기 직전이면 공격
      if (r === 10 || r === 12) s += hand.length <= 3 ? 6 : 3;    // 한 번 더
      if (r === 6) s += 2.5;
      if (isJoker(id)) s -= G.attack > 0 || opp.length <= 2 ? 0 : 6;   // 조커는 아껴 둔다
      if (!isJoker(id)) s += cnt[suitOf(id)] * 0.6;               // 많은 무늬로 이어 간다
      if (level === 'easy') s += (Math.random() - 0.5) * 12;
      else if (level === 'normal') s += (Math.random() - 0.5) * 4;
      return s;
    };
    opts.sort((a, b) => score(b) - score(a));
    const id = opts[0], r = rankOf(id);
    const out = { type: 'play', id };
    if (r === 6 && !attackOf(id)) { const c = cnt.slice(); if (!isJoker(id)) c[suitOf(id)]--; out.suit = c.indexOf(Math.max(...c)); }
    return out;
  }

  root.OneCard = { SUITS, SUIT_NAME, RANKS, JOKER_C, JOKER_B, MAX_HAND, suitOf, rankOf, isJoker, attackOf, name, deal, canPlay, playable, play, chooseSuit, drawCards, declare, aiMove, top, rng };
})(typeof window !== 'undefined' ? window : globalThis);
