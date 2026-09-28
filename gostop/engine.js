/* 고스톱 규칙 엔진 (둘이 치면 맞고, 셋이 치면 고스톱) — 화면과 무관한 순수 상태 함수.
 * index.html 과 node 테스트(tools/test-gostop.js)가 같이 쓴다. 상태 G 는 JSON 으로 그대로 주고받는다.
 * 둘: 각자 10장, 바닥 8장. 셋: 각자 7장, 바닥 6장. 차례는 자리 번호 순.
 * 흐름: play(카드) → [pick] → flip → [pick] → finish → [go/stop] → 다음 차례. 손패가 없으면 뒤집기만 한다.
 * 셈: 난 사람이 진 사람마다 점수를 받는다(누적은 주고받기라 합이 0). 피박(둘 7장 미만, 셋 6장 미만)·광박·멍박은 진 사람마다 따로.
 *   고박: 고를 부르고 지면 — 둘이 칠 땐 2배, 셋이 칠 땐 다른 진 사람 몫까지 혼자 낸다(독박).
 *   쪽·따닥·뻑 먹기·싹쓸이·폭탄은 다른 사람 모두에게서 피를 한 장씩 가져온다.
 *   조커(보너스패, 넣을지는 고른다): 48·49번, 둘 다 쌍피(피 2장). 달이 없어 아무 패와도 짝이 되지 않는다.
 *     손에서 내면 바로 내 피가 되고 더미에서 한 장을 손에 보충한 뒤 패를 한 장 더 낸다. 더미에서 뒤집히면 내 피가 되고 한 장 더 뒤집는다.
 *     처음 바닥에 깔리면 선이 갖고 더미에서 바닥을 채운다. 그 차례에 뻑이 나면 뒤집힌 조커는 뻑 더미에 붙었다가(G.stuck) 그 달을 먹는 사람이 가져간다.
 *   코인(놀이용, 진짜 돈 아님): 1점에 RATE 코인, 처음 START 코인. 가진 것보다 많이 잃으면 가진 만큼만 내고 파산하며,
 *   파산한 사람은 다음 판을 돌릴 때 START 코인을 다시 받는다(bust 에 횟수가 남는다). */
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
  const JOKERS = [48, 49];
  JOKERS.forEach(id => CARDS.push({ id, m: 0, t: 'p', sub: 'joker', pv: 2 }));
  const isJoker = id => id >= 48;
  const C = id => CARDS[id];
  const MAX_PLAYERS = 3, RATE = 100, START = 10000;
  const RULES = { 2: { hand: 10, floor: 8, pibak: 7 }, 3: { hand: 7, floor: 6, pibak: 6 } };   // pibak: 진 사람 피가 이보다 적으면 피박
  const seatsOf = n => Array.from({ length: n }, (_, i) => i);

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
  const byMonth = (arr, m) => arr.filter(id => C(id).m === m);   // 조커(달 0)는 어느 달에도 안 걸린다
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
  // bank: { coins: [자리별 코인], bust: [자리별 파산 횟수], jokers: 0 | 2 } — 없으면 모두 START 코인, 조커 없이 시작
  function deal(seed, first, carry, total, n, bank) {
    const N = n === 2 ? 2 : 3, HAND = RULES[N].hand, FLOOR = RULES[N].floor;
    const zeros = () => Array(N).fill(0);
    const jokers = bank && bank.jokers === 2 ? 2 : 0;
    const r = rng(seed);
    let deck;
    for (let tries = 0; tries < 50; tries++) {
      deck = CARDS.map(c => c.id).filter(id => id < 48 + jokers);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      const hs = seatsOf(N).map(i => deck.slice(HAND * i, HAND * (i + 1))), fl = deck.slice(HAND * N, HAND * N + FLOOR);
      // 바닥에 같은 달 3장 이상, 손에 같은 달 4장(총통)은 다시 섞는다
      const bad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(m => countMonth(fl, m) >= 3 || hs.some(h => countMonth(h, m) === 4));
      if (!bad) break;
    }
    first = Number.isInteger(first) && first >= 0 && first < N ? first : 0;
    const coins = seatsOf(N).map(i => (bank && Number.isInteger(bank.coins && bank.coins[i]) ? Math.max(0, bank.coins[i]) : START));
    const bust = seatsOf(N).map(i => (bank && Number.isInteger(bank.bust && bank.bust[i]) ? Math.max(0, bank.bust[i]) : 0));
    coins.forEach((c, i) => { if (c <= 0) { coins[i] = START; bust[i]++; } });   // 파산한 사람은 다시 받는다
    const G = {
      seed, n: N, jokers, stuck: {}, first, turn: first, coins, bust, carry: carry || 0, total: total && total.length === N ? total.slice() : zeros(),
      hands: seatsOf(N).map(i => deck.slice(HAND * i, HAND * (i + 1))), floor: deck.slice(HAND * N, HAND * N + FLOOR), deck: deck.slice(HAND * N + FLOOR).reverse(),   // pop() 이 다음 장
      caps: seatsOf(N).map(() => []), go: zeros(), goAt: zeros(), mult: zeros(),
      stage: 'play', pend: null, over: false, winner: -1, result: null, log: [], last: null
    };
    // 바닥에 깔린 조커는 선이 갖고, 더미에서 바닥을 채운다
    for (let guard = 0; guard < 4 && G.floor.some(isJoker); guard++) {
      const got = G.floor.filter(isJoker);
      G.floor = G.floor.filter(id => !isJoker(id));
      G.caps[first].push(...got);
      got.forEach(() => G.floor.push(G.deck.pop()));
      G.log.push({ t: first, s: '바닥의 조커 ' + got.length + '장을 선이 가져감' });
    }
    return G;
  }

  // ---------- 한 차례 ----------
  function newPend(G) {
    return { take: [], hold: null, stay: -1, flipped: -1, pi: 0, notes: [], floorAtStart: G.floor.length, played: -1, bomb: false, jk: [] };   // jk: 이번 차례에 뒤집힌 조커
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
    if (isJoker(card)) {                                               // 조커: 바로 내 피로, 한 장 보충하고 한 장 더 낸다
      if (G.stage !== 'play') return false;
      remove(hand, card);
      G.caps[t].push(card);
      const drew = G.deck.length > hand.length ? G.deck.pop() : -1;    // 남은 차례에 뒤집을 패는 남겨 둔다
      if (drew >= 0) hand.push(drew);
      G.log.push({ t, s: '조커 냄 · 피 2장' + (drew >= 0 ? ' · 한 장 보충' : '') });
      G.last = { t, played: card, flipped: -1, take: [card], notes: ['조커'], bonus: [] };
      return true;
    }
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
    while (G.deck.length && isJoker(G.deck[G.deck.length - 1])) P.jk.push(G.deck.pop());   // 조커가 나오면 한 장 더 뒤집는다
    if (!G.deck.length) return finish(G);
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
      } else {                                                         // 뻑: 셋 다 바닥에 남는다. 뒤집힌 조커도 거기 붙는다
        G.floor.push(P.hold[0], P.hold[1], d); P.hold = null; P.notes.push('뻑');
        P.jk.forEach(j => { G.floor.push(j); G.stuck[j] = m; });
        P.stuck = P.jk; P.jk = [];
      }
      return finish(G);
    }
    if (matches.length === 0) { G.floor.push(d); return finish(G); }
    if (matches.length === 1) { P.take.push(d, matches[0]); remove(G.floor, matches[0]); return finish(G); }
    if (matches.length === 2) { sweep(G); G.stage = 'pick'; P.pick = { card: d, opts: matches.slice(), step: 'flip' }; return true; }
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
  // 뻑 더미에 붙어 있던 조커: 그 달 패가 바닥에서 다 나가면 같이 가져간다
  function sweep(G) {
    for (const j of G.floor.filter(isJoker)) {
      if (countMonth(G.floor, G.stuck[j]) === 0) { remove(G.floor, j); delete G.stuck[j]; G.pend.take.push(j); }
    }
  }
  function finish(G) {
    const P = G.pend, t = G.turn, N = G.n, o = (t + 1) % N;
    if (P.hold) { P.take.push(...P.hold); P.hold = null; }
    if (P.jk.length) { P.take.push(...P.jk); P.notes.push('조커'); }
    const bonus = P.jk.concat(P.stuck || []);
    sweep(G);
    G.caps[t].push(...P.take);
    if (G.floor.length === 0 && P.take.length && P.floorAtStart > 0) { P.pi++; P.notes.push('싹쓸이'); }
    let stolen = 0;
    for (let k = 1; k < N; k++) for (let i = 0; i < P.pi; i++) if (stealPi(G, (t + k) % N, t)) stolen++;
    const parts = [];
    if (P.played >= 0) parts.push(cardName(P.played) + ' 냄');
    if (P.flipped >= 0) parts.push(cardName(P.flipped) + ' 뒤집음');
    if (P.take.length) parts.push(P.take.length + '장 가져감');
    if (P.notes.length) parts.push(P.notes.join('·') + (stolen ? ' (피 ' + stolen + '장 뺏음)' : ''));
    G.log.push({ t, s: parts.join(' · ') });
    G.last = { t, played: P.played, flipped: P.flipped, take: P.take.slice(), notes: P.notes.slice(), bonus };
    G.pend = null;
    const sc = best(G.caps[t]).s;
    const canStop = sc >= 3 && sc > G.goAt[t];
    if (G.deck.length === 0) {                                         // 마지막 차례
      if (canStop) return endGame(G, t);
      if (G.hands.every(h => h.length === 0)) return nagari(G);
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
    G.turn = (t + 1) % G.n; G.stage = 'play';
    return true;
  }
  function nagari(G) {
    G.over = true; G.winner = -1; G.stage = 'over';
    G.result = { nagari: true, text: '나가리 — 아무도 나지 못했습니다. 다음 판은 ' + Math.pow(2, G.carry + 1) + '배' };
    G.log.push({ t: G.turn, s: '나가리' });
    return true;
  }
  function endGame(G, w) {
    const mine = best(G.caps[w]);
    const base = mine.s + G.go[w];
    const lines = mine.d.slice();
    if (G.go[w]) lines.push(G.go[w] + '고 +' + G.go[w]);
    const mults = [];                                                  // 진 사람 모두에게 똑같이 붙는 배수
    if (G.go[w] >= 3) mults.push([G.go[w] + '고', Math.pow(2, G.go[w] - 2)]);
    for (let i = 0; i < G.mult[w]; i++) mults.push(['흔들기·폭탄', 2]);
    if (G.carry) mults.push(['나가리 이월', Math.pow(2, G.carry)]);
    let common = base;
    for (const [, k] of mults) common *= k;
    const pays = [], N = G.n, PIBAK = RULES[N].pibak;
    for (let k = 1; k < N; k++) {
      const l = (w + k) % N, theirs = best(G.caps[l]), tags = [];
      let pts = common;
      if (mine.pi >= 10 && theirs.pi < PIBAK) { pts *= 2; tags.push('피박'); }
      if (mine.gw >= 3 && theirs.gw === 0) { pts *= 2; tags.push('광박'); }
      if (mine.yeol >= 7 && theirs.yeol === 0) { pts *= 2; tags.push('멍박'); }
      pays.push({ t: l, pts, owe: pts, tags });
    }
    // 고박: 둘이 칠 땐 2배. 셋이 칠 땐 고를 부르고 진 사람이 (혼자라면) 다른 사람 몫까지 낸다
    const gone = pays.filter(p => G.go[p.t] > 0);
    if (N === 2) {
      if (gone.length) { gone[0].pts *= 2; gone[0].owe *= 2; gone[0].tags.push('고박'); }
    } else if (gone.length === 1) {
      const other = pays.find(p => p !== gone[0]);
      gone[0].owe += other.owe; gone[0].tags.push('고박');
      other.owe = 0; other.tags.push('면제');
    }
    let sum = 0, coin = 0;
    for (const p of pays) {
      G.total[p.t] -= p.owe; sum += p.owe;
      p.coin = Math.min(p.owe * RATE, G.coins[p.t]);                   // 가진 만큼만 낸다
      G.coins[p.t] -= p.coin; coin += p.coin;
      if (p.owe && G.coins[p.t] === 0) p.tags.push('파산');
    }
    G.total[w] += sum;
    G.coins[w] += coin;
    G.over = true; G.winner = w; G.stage = 'over';
    G.result = { pts: sum, coin, base: mine.s, lines, mults, pays, gukjinAsPi: mine.gukjinAsPi };
    G.log.push({ t: w, s: '스톱 · ' + sum + '점' });
    return true;
  }

  // ---------- 이름 ----------
  function cardName(id) {
    const c = C(id);
    if (isJoker(id)) return '조커';
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
  function setGain(caps, opps, id) {
    let g = 0;
    for (const s of SETS) {
      if (!s.has(id)) continue;
      const have = caps.filter(s.has).length, opp = Math.max(...opps.map(o => o.filter(s.has).length));
      if (have + 1 >= s.n) g += s.bonus + 1; else if (have + 1 === s.n - 1) g += 1.5;
      if (opp >= s.n - 1) g += s.bonus * 0.8;                         // 상대가 완성 직전인 걸 가로챈다
    }
    return g;
  }
  function aiPlay(G, level) {
    const t = G.turn, hand = G.hands[t], caps = G.caps[t], opp = G.caps.filter((_, i) => i !== t);
    if (!hand.length) return { card: -1 };
    const jk = hand.find(isJoker);
    if (jk !== undefined) return { card: jk };                         // 조커는 들고 있을 이유가 없다
    const seen = new Set([...G.floor, ...[].concat(...G.caps), ...hand]);
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
    const t = G.turn, opts = G.pend.pick.opts, opp = G.caps.filter((_, i) => i !== t);
    return opts.slice().sort((a, b) => VAL(b) + setGain(G.caps[t], opp, b) - VAL(a) - setGain(G.caps[t], opp, a))[0];
  }
  function aiGo(G, level) {
    const t = G.turn, sc = best(G.caps[t]).s, left = G.deck.length;
    const others = G.caps.filter((_, i) => i !== t).map(c => best(c));
    const os = Math.max(...others.map(o => o.s)), theirs = { pi: Math.max(...others.map(o => o.pi)) };   // 가장 앞선 상대를 본다
    if (left <= 3) return false;
    let p = os === 0 ? 0.75 : os <= 2 ? 0.45 : 0.12;
    if (sc >= 7) p -= 0.25;
    if (G.go[t] >= 2) p -= 0.2;
    if (theirs.pi < 5 && best(G.caps[t]).pi >= 8) p += 0.2;            // 피박 노리기
    if (level === 'easy') p = 0.5; else if (level === 'normal') p = p * 0.8 + 0.1;
    return Math.random() < Math.max(0.05, Math.min(0.9, p));
  }

  root.GoStop = { MAX_PLAYERS, RULES, RATE, START, JOKERS, isJoker, CARDS, MONTH, YEOL_NAME, cardName, deal, play, pick, decideGo, best, points, aiPlay, aiPick, aiGo, rng };
})(typeof window !== 'undefined' ? window : globalThis);
