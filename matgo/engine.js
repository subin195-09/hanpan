/* 맞고 규칙 엔진 — 화면과 무관한 순수 상태 함수. index.html 과 node 테스트가 같이 쓴다.
 * 상태 G 는 JSON 으로 그대로 주고받는다 (온라인 2인).
 * 흐름: play(카드) → [pick] → flip → [pick] → finish → [go/stop] → 다음 차례. 손패가 없으면 뒤집기만 한다. */
(function (root) {
  const MONTH = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국화', '단풍', '오동', '비'];
  const YEOL_NAME = { 2: '휘파람새', 4: '두견새', 5: '다리', 6: '나비', 7: '멧돼지', 8: '기러기', 9: '국진', 10: '사슴', 12: '제비' };
  // t: g 광 · y 열끗 · t 띠 · p 피,  sub: hong/cheong/cho 단, bird 고도리, bi 비, ssang 쌍피, gukjin 국진
  const SPEC = {
    1: [['g'], ['t', 'hong'], ['p'], ['p']],
    2: [['y', 'bird'], ['t', 'hong'], ['p'], ['p']],
    3: [['g'], ['t', 'hong'], ['p'], ['p']],
    4: [['y', 'bird'], ['t', 'cho'], ['p'], ['p']],
    5: [['y'], ['t', 'cho'], ['p'], ['p']],
    6: [['y'], ['t', 'cheong'], ['p'], ['p']],
    7: [['y'], ['t', 'cho'], ['p'], ['p']],
    8: [['g'], ['y', 'bird'], ['p'], ['p']],
    9: [['y', 'gukjin'], ['t', 'cheong'], ['p'], ['p']],
    10: [['y'], ['t', 'cheong'], ['p'], ['p']],
    11: [['g'], ['p', 'ssang'], ['p'], ['p']],
    12: [['g', 'bi'], ['y'], ['t', 'bi'], ['p', 'ssang']]
  };
  const CARDS = [];
  for (let m = 1; m <= 12; m++) SPEC[m].forEach(([t, sub], k) => CARDS.push({ id: (m - 1) * 4 + k, m, t, sub: sub || '', pv: t === 'p' ? (sub === 'ssang' ? 2 : 1) : 0 }));
  const C = id => CARDS[id];

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
  const byMonth = (arr, m) => arr.filter(id => C(id).m === m);
  const countMonth = (arr, m) => byMonth(arr, m).length;

  // ---------- 점수 ----------
  function points(caps, gukjinAsPi) {
    let gw = 0, bi = false, yeol = 0, birds = 0, tti = 0, hong = 0, cheong = 0, cho = 0, pi = 0;
    for (const id of caps) {
      const c = C(id);
      if (c.t === 'g') { gw++; if (c.sub === 'bi') bi = true; }
      else if (c.t === 'y') { if (c.sub === 'gukjin' && gukjinAsPi) pi += 2; else { yeol++; if (c.sub === 'bird') birds++; } }
      else if (c.t === 't') { tti++; if (c.sub === 'hong') hong++; else if (c.sub === 'cheong') cheong++; else if (c.sub === 'cho') cho++; }
      else pi += c.pv;
    }
    let s = 0;
    const d = [];
    if (gw === 5) { s += 15; d.push('오광 15'); }
    else if (gw === 4) { s += 4; d.push('사광 4'); }
    else if (gw === 3) { const v = bi ? 2 : 3; s += v; d.push((bi ? '비삼광 ' : '삼광 ') + v); }
    if (birds === 3) { s += 5; d.push('고도리 5'); }
    if (yeol >= 5) { s += yeol - 4; d.push('열끗 ' + yeol + '장 ' + (yeol - 4)); }
    if (hong === 3) { s += 3; d.push('홍단 3'); }
    if (cheong === 3) { s += 3; d.push('청단 3'); }
    if (cho === 3) { s += 3; d.push('초단 3'); }
    if (tti >= 5) { s += tti - 4; d.push('띠 ' + tti + '장 ' + (tti - 4)); }
    if (pi >= 10) { s += pi - 9; d.push('피 ' + pi + '장 ' + (pi - 9)); }
    return { s, d, gw, yeol, tti, pi, gukjinAsPi: !!gukjinAsPi };
  }
  function best(caps) {
    const a = points(caps, false);
    if (!caps.some(id => C(id).sub === 'gukjin')) return a;
    const b = points(caps, true);
    return b.s > a.s || (b.s === a.s && b.pi >= 10) ? b : a;
  }

  // ---------- 판 시작 ----------
  function deal(seed, first, carry, total) {
    const r = rng(seed);
    let deck;
    for (let tries = 0; tries < 50; tries++) {
      deck = CARDS.map(c => c.id);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      const h0 = deck.slice(0, 10), h1 = deck.slice(10, 20), fl = deck.slice(20, 28);
      // 바닥에 같은 달 3장 이상, 손에 같은 달 4장(총통)은 다시 섞는다
      const bad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(m => countMonth(fl, m) >= 3 || countMonth(h0, m) === 4 || countMonth(h1, m) === 4);
      if (!bad) break;
    }
    return {
      seed, first, turn: first, carry: carry || 0, total: total ? total.slice() : [0, 0],
      hands: [deck.slice(0, 10), deck.slice(10, 20)], floor: deck.slice(20, 28), deck: deck.slice(28).reverse(),   // pop() 이 다음 장
      caps: [[], []], go: [0, 0], goAt: [0, 0], mult: [0, 0],
      stage: 'play', pend: null, over: false, winner: -1, result: null, log: [], last: null
    };
  }

  // ---------- 한 차례 ----------
  function newPend(G) {
    return { take: [], hold: null, stay: -1, flipped: -1, pi: 0, notes: [], floorAtStart: G.floor.length, played: -1, bomb: false };
  }
  const remove = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };

  // 손패에서 카드를 낸다. 같은 달 3장이 손에 있고 바닥에 없으면 흔들기를 물어본다 (shake: true/false 로 답을 넘긴다)
  function play(G, card, shake) {
    if (G.stage !== 'play' && G.stage !== 'shake') return false;
    const t = G.turn, hand = G.hands[t];
    G.pend = G.pend || newPend(G);
    const P = G.pend;
    if (card === -1 || card === undefined || card === null) {          // 낼 카드가 없다: 뒤집기만
      if (hand.length) return false;
      G.stage = 'flip';
      return flip(G);
    }
    if (!hand.includes(card)) return false;
    const m = C(card).m, matches = byMonth(G.floor, m), inHand = countMonth(hand, m);
    if (G.stage === 'play' && inHand >= 3 && matches.length === 0 && shake === undefined) {
      G.stage = 'shake';
      P.played = card;
      return true;                                                     // 화면이 흔들기 여부를 물어본다
    }
    if (shake === true) { G.mult[t]++; P.notes.push('흔들기'); }
    remove(hand, card);
    P.played = card;
    if (inHand >= 3 && matches.length === 1) {                         // 폭탄: 같은 달 3장을 한꺼번에 내고 다 가져간다
      const others = byMonth(hand, m).slice(0, 2);
      others.forEach(id => remove(hand, id));
      P.take.push(card, ...others, matches[0]);
      remove(G.floor, matches[0]);
      G.mult[t]++; P.pi++; P.bomb = true; P.notes.push('폭탄');
      G.stage = 'flip';
      return flip(G);
    }
    if (matches.length === 0) { G.floor.push(card); P.stay = card; G.stage = 'flip'; return flip(G); }
    if (matches.length === 1) { P.hold = [card, matches[0]]; remove(G.floor, matches[0]); G.stage = 'flip'; return flip(G); }
    if (matches.length === 2) { G.stage = 'pick'; P.pick = { card, opts: matches.slice(), step: 'play' }; return true; }
    P.take.push(card, ...matches); matches.forEach(id => remove(G.floor, id));                     // 뻑 먹기
    P.pi++; P.notes.push('뻑 먹기');
    G.stage = 'flip';
    return flip(G);
  }
  function pick(G, chosen) {
    if (G.stage !== 'pick') return false;
    const P = G.pend, pk = P.pick;
    if (!pk.opts.includes(chosen)) return false;
    delete P.pick;
    if (pk.step === 'play') {
      P.hold = [pk.card, chosen]; remove(G.floor, chosen);
      G.stage = 'flip';
      return flip(G);
    }
    P.take.push(pk.card, chosen); remove(G.floor, chosen);
    return finish(G);
  }
  function flip(G) {
    const P = G.pend;
    const d = G.deck.pop();
    P.flipped = d;
    const m = C(d).m, matches = byMonth(G.floor, m);
    if (P.stay >= 0 && C(P.stay).m === m) {                            // 쪽
      P.take.push(P.stay, d); remove(G.floor, P.stay); P.stay = -1;
      P.pi++; P.notes.push('쪽');
      return finish(G);
    }
    if (P.hold && C(P.hold[0]).m === m) {
      if (matches.length >= 1) {                                       // 따닥: 낸 패·짝·남은 짝·뒤집은 패 모두
        P.take.push(...P.hold, d, ...matches); matches.forEach(id => remove(G.floor, id));
        P.hold = null; P.pi++; P.notes.push('따닥');
      } else {                                                         // 뻑: 셋 다 바닥에 남는다
        G.floor.push(P.hold[0], P.hold[1], d); P.hold = null; P.notes.push('뻑');
      }
      return finish(G);
    }
    if (matches.length === 0) { G.floor.push(d); return finish(G); }
    if (matches.length === 1) { P.take.push(d, matches[0]); remove(G.floor, matches[0]); return finish(G); }
    if (matches.length === 2) { G.stage = 'pick'; P.pick = { card: d, opts: matches.slice(), step: 'flip' }; return true; }
    P.take.push(d, ...matches); matches.forEach(id => remove(G.floor, id));
    P.pi++; P.notes.push('뻑 먹기');
    return finish(G);
  }
  // 상대 피 한 장 가져오기: 한 장짜리 피 → 쌍피 순서로
  function stealPi(G, from, to) {
    const src = G.caps[from];
    const pick1 = src.find(id => C(id).t === 'p' && C(id).pv === 1) ?? src.find(id => C(id).t === 'p');
    if (pick1 === undefined) return false;
    remove(src, pick1); G.caps[to].push(pick1);
    return true;
  }
  function finish(G) {
    const P = G.pend, t = G.turn, o = 1 - t;
    if (P.hold) { P.take.push(...P.hold); P.hold = null; }
    G.caps[t].push(...P.take);
    if (G.floor.length === 0 && P.take.length && P.floorAtStart > 0) { P.pi++; P.notes.push('싹쓸이'); }
    let stolen = 0;
    for (let i = 0; i < P.pi; i++) if (stealPi(G, o, t)) stolen++;
    const parts = [];
    if (P.played >= 0) parts.push(cardName(P.played) + ' 냄');
    if (P.flipped >= 0) parts.push(cardName(P.flipped) + ' 뒤집음');
    if (P.take.length) parts.push(P.take.length + '장 가져감');
    if (P.notes.length) parts.push(P.notes.join('·') + (stolen ? ' (상대 피 ' + stolen + '장)' : ''));
    G.log.push({ t, s: parts.join(' · ') });
    G.last = { t, played: P.played, flipped: P.flipped, take: P.take.slice(), notes: P.notes.slice() };
    G.pend = null;
    const sc = best(G.caps[t]).s;
    const canStop = sc >= 3 && sc > G.goAt[t];
    if (G.deck.length === 0) {                                         // 마지막 차례
      if (canStop) return endGame(G, t);
      if (G.hands[0].length === 0 && G.hands[1].length === 0) return nagari(G);
    }
    if (canStop) { G.stage = 'go'; return true; }
    G.turn = o; G.stage = 'play';
    return true;
  }
  function decideGo(G, go) {
    if (G.stage !== 'go') return false;
    const t = G.turn;
    if (!go) return endGame(G, t);
    G.go[t]++;
    G.goAt[t] = best(G.caps[t]).s;
    G.log.push({ t, s: G.go[t] + '고!' });
    if (G.deck.length === 0) return nagari(G);
    G.turn = 1 - t; G.stage = 'play';
    return true;
  }
  function nagari(G) {
    G.over = true; G.winner = -1; G.stage = 'over';
    G.result = { nagari: true, text: '나가리 — 아무도 나지 못했습니다. 다음 판은 ' + Math.pow(2, G.carry + 1) + '배' };
    G.log.push({ t: G.turn, s: '나가리' });
    return true;
  }
  function endGame(G, w) {
    const l = 1 - w, mine = best(G.caps[w]), theirs = best(G.caps[l]);
    let pts = mine.s + G.go[w];
    const lines = mine.d.slice();
    if (G.go[w]) lines.push(G.go[w] + '고 +' + G.go[w]);
    const mults = [];
    if (G.go[w] >= 3) mults.push([G.go[w] + '고', Math.pow(2, G.go[w] - 2)]);
    if (mine.pi >= 10 && theirs.pi < 7) mults.push(['피박', 2]);
    if (mine.gw >= 3 && theirs.gw === 0) mults.push(['광박', 2]);
    if (mine.yeol >= 7 && theirs.yeol === 0) mults.push(['멍박', 2]);
    if (G.go[l] > 0) mults.push(['고박', 2]);
    for (let i = 0; i < G.mult[w]; i++) mults.push(['흔들기·폭탄', 2]);
    if (G.carry) mults.push(['나가리 이월', Math.pow(2, G.carry)]);
    for (const [, k] of mults) pts *= k;
    G.total[w] += pts;
    G.over = true; G.winner = w; G.stage = 'over';
    G.result = { pts, base: mine.s, lines, mults, gukjinAsPi: mine.gukjinAsPi };
    G.log.push({ t: w, s: '스톱 · ' + pts + '점' });
    return true;
  }

  // ---------- 이름 ----------
  function cardName(id) {
    const c = C(id);
    const kind = c.t === 'g' ? (c.sub === 'bi' ? '비광' : '광') : c.t === 'y' ? YEOL_NAME[c.m] : c.t === 't' ? ({ hong: '홍단', cheong: '청단', cho: '초단', bi: '비띠' })[c.sub] : (c.sub === 'ssang' ? '쌍피' : '피');
    return c.m + '월 ' + kind;
  }

  // ---------- AI ----------
  const VAL = id => {
    const c = C(id);
    if (c.t === 'g') return c.sub === 'bi' ? 4.5 : 6;
    if (c.t === 'y') return c.sub === 'bird' ? 4.5 : c.sub === 'gukjin' ? 3.5 : 3;
    if (c.t === 't') return c.sub === 'bi' ? 2 : 3.5;
    return c.pv === 2 ? 2.2 : 1;
  };
  const SETS = [
    { name: 'godori', has: id => C(id).sub === 'bird', n: 3, bonus: 5 },
    { name: 'hong', has: id => C(id).sub === 'hong', n: 3, bonus: 3 },
    { name: 'cheong', has: id => C(id).sub === 'cheong', n: 3, bonus: 3 },
    { name: 'cho', has: id => C(id).sub === 'cho', n: 3, bonus: 3 },
    { name: 'gwang', has: id => C(id).t === 'g', n: 3, bonus: 3 }
  ];
  function setGain(caps, oppCaps, id) {
    let g = 0;
    for (const s of SETS) {
      if (!s.has(id)) continue;
      const have = caps.filter(s.has).length, opp = oppCaps.filter(s.has).length;
      if (have + 1 >= s.n) g += s.bonus + 1; else if (have + 1 === s.n - 1) g += 1.5;
      if (opp >= s.n - 1) g += s.bonus * 0.8;                         // 상대가 완성 직전인 걸 가로챈다
    }
    return g;
  }
  function aiPlay(G, level) {
    const t = G.turn, hand = G.hands[t], caps = G.caps[t], opp = G.caps[1 - t];
    if (!hand.length) return { card: -1 };
    const seen = new Set([...G.floor, ...caps, ...opp, ...hand]);
    const cands = hand.map(card => {
      const m = C(card).m, matches = byMonth(G.floor, m), inHand = countMonth(hand, m);
      let score;
      if (inHand >= 3 && matches.length === 1) score = 12 + VAL(card) + VAL(matches[0]);
      else if (matches.length === 0) {
        const unseen = 4 - [...seen].filter(id => C(id).m === m).length;   // 상대 손·더미에 남은 같은 달
        score = -VAL(card) * 0.6 - unseen * 0.7 + (inHand >= 2 ? 0.8 : 0);
        if (inHand >= 3) score += 3;                                       // 흔들기 각
      } else if (matches.length === 3) score = 6 + VAL(card) + matches.reduce((a, id) => a + VAL(id) + setGain(caps, opp, id), 0);
      else {
        const bestM = matches.slice().sort((a, b) => VAL(b) + setGain(caps, opp, b) - VAL(a) - setGain(caps, opp, a))[0];
        score = VAL(card) + setGain(caps, opp, card) + VAL(bestM) + setGain(caps, opp, bestM);
        if (matches.length === 1 && inHand >= 2) score -= 0.5;             // 뻑 위험
      }
      const noise = level === 'easy' ? 4 : level === 'normal' ? 1.5 : 0.3;
      return { card, score: score + (Math.random() - 0.5) * noise, shake: inHand >= 3 && matches.length === 0 };
    });
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0];
    return { card: c.card, shake: c.shake ? (level === 'easy' ? Math.random() < 0.5 : true) : undefined };
  }
  function aiPick(G) {
    const t = G.turn, opts = G.pend.pick.opts;
    return opts.slice().sort((a, b) => VAL(b) + setGain(G.caps[t], G.caps[1 - t], b) - VAL(a) - setGain(G.caps[t], G.caps[1 - t], a))[0];
  }
  function aiGo(G, level) {
    const t = G.turn, sc = best(G.caps[t]).s, os = best(G.caps[1 - t]).s, left = G.deck.length, theirs = best(G.caps[1 - t]);
    if (left <= 2) return false;
    let p = os === 0 ? 0.75 : os <= 2 ? 0.45 : 0.12;
    if (sc >= 7) p -= 0.25;
    if (G.go[t] >= 2) p -= 0.2;
    if (theirs.pi < 5 && best(G.caps[t]).pi >= 8) p += 0.2;            // 피박 노리기
    if (level === 'easy') p = 0.5; else if (level === 'normal') p = p * 0.8 + 0.1;
    return Math.random() < Math.max(0.05, Math.min(0.9, p));
  }

  root.Matgo = { CARDS, MONTH, YEOL_NAME, cardName, deal, play, pick, decideGo, best, points, aiPlay, aiPick, aiGo, rng };
})(typeof window !== 'undefined' ? window : globalThis);
