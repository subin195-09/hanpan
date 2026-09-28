/* 원카드 엔진 검사: AI 끼리 수천 판 돌려 카드 54장 보존·차례·종료를 확인한다.  node tools/test-onecard.js */
require('../onecard/engine.js');
const M = globalThis.OneCard;
const assert = (c, m) => { if (!c) throw new Error(m); };
function check(G, tag) {
  const all = [].concat(...G.hands, G.pile, G.draw);
  assert(all.length === 54 && new Set(all).size === 54, tag + ': 카드 수 ' + all.length);
  assert(G.hands.length === G.n && G.out.length === G.n && G.declared.length === G.n, tag + ': 자리 수');
  if (!G.over) {
    assert(G.turn >= 0 && G.turn < G.n && !G.out[G.turn], tag + ': 탈락한 자리의 차례 ' + G.turn);
    assert(M.alive(G) >= 2, tag + ': 혼자 남았는데 안 끝남');
    G.out.forEach((o, i) => assert(!o || G.hands[i].length === 0, tag + ': 탈락자 손패'));
  } else {
    assert(G.winner >= 0 && G.winner < G.n, tag + ': 승자 ' + G.winner);
    assert(G.n === 2 || !G.out[G.winner], tag + ': 탈락자가 승자');
  }
}
const stat = {};
for (const n of [2, 3, 4]) {
  let moves = 0, outs = 0, stuck = 0, skips = 0, revs = 0;
  const wins = Array(n).fill(0);
  const GAMES = 3000;
  for (let g = 0; g < GAMES; g++) {
    const G = M.deal(1 + g * 7 + n, g % n, n);
    check(G, 'deal');
    let steps = 0;
    while (!G.over && steps < 5000) {
      const t = G.turn, dir = G.dir;
      if (G.hands[t].length <= 2 && !G.declared[t] && Math.random() < 0.8) M.declare(G);
      const a = M.aiMove(G, ['easy', 'normal', 'hard'][g % 3]);
      const ok = a.type === 'play' ? M.play(G, a.id, a.suit) : a.type === 'draw' ? M.drawCards(G) : M.chooseSuit(G, a.suit);
      assert(ok, 'n=' + n + ' 판 ' + g + ': AI 수가 거절됨 ' + JSON.stringify(a));
      if (a.type === 'play' && M.rankOf(a.id) === 10 && !G.over && n > 2 && G.turn !== t) skips++;
      if (G.dir !== dir) revs++;
      check(G, 'n=' + n + ' 판 ' + g + ' 수 ' + steps);
      steps++;
    }
    if (!G.over) stuck++;
    else wins[G.winner]++;
    outs += G.out.filter(Boolean).length;
    moves += steps;
  }
  assert(stuck === 0, 'n=' + n + ': 안 끝난 판 ' + stuck);
  stat[n] = { 평균수: Math.round(moves / GAMES), 파산: outs, 건너뛰기: skips, 방향전환: revs, 승: wins.join('/') };
}
// 규칙 단위 검사
{
  const G = M.deal(5, 0, 4);
  // 손패를 직접 짜서 J·Q·K 와 공격 전달을 확인
  const put = (hands, topCard) => {
    const used = new Set([].concat(...hands, [topCard]));
    G.hands = hands.map(h => h.slice()); G.pile = [topCard];
    G.draw = Array.from({ length: 54 }, (_, i) => i).filter(i => !used.has(i));
    G.suit = M.suitOf(topCard); G.attack = 0; G.turn = 0; G.dir = 1; G.out = [false, false, false, false]; G.declared = [false, false, false, false]; G.over = false; G.stage = 'play';
  };
  put([[10, 11, 12, 1, 3], [14, 20, 21], [27, 30, 31], [40, 41, 42]], 4);   // 바닥 ♠5
  assert(M.play(G, 10) && G.turn === 2, 'J 는 다음 사람을 건너뛴다');
  put([[10, 11, 12, 1, 3], [14, 20, 21], [27, 30, 31], [40, 41, 42]], 4);
  assert(M.play(G, 11) && G.dir === -1 && G.turn === 3, 'Q 는 방향을 바꾼다');
  put([[10, 11, 12, 1, 3], [14, 20, 21], [27, 30, 31], [40, 41, 42]], 4);
  assert(M.play(G, 12) && G.turn === 0, 'K 는 한 번 더');
  put([[10, 11, 12, 1, 3], [14, 20, 21], [27, 30, 31], [40, 41, 42]], 4);
  assert(M.play(G, 1) && G.turn === 1 && G.attack === 2, '♠2 공격은 다음 사람에게');
  assert(M.play(G, 14) && G.turn === 2 && G.attack === 4, '♥2 로 되받으면 누적되어 그다음 사람에게');
  assert(!M.canPlay(G, 30), '공격 중엔 평범한 카드를 못 낸다');
  assert(M.drawCards(G) && G.hands[2].length === 7 && G.attack === 0 && G.turn === 3, '못 막으면 쌓인 만큼 먹는다');
  // 파산 탈락
  put([[1, 3], Array.from({ length: 14 }, (_, i) => 15 + i), [33, 34, 35], [40, 41, 42]], 4);
  assert(M.play(G, 1) && G.turn === 1, '공격');
  assert(M.drawCards(G) && G.out[1] && !G.over && G.hands[1].length === 0 && G.turn === 2, '4인은 15장을 넘으면 탈락하고 판은 계속');
  check(G, '탈락 뒤');
  G.turn = 0;
  assert(M.nextSeat(G, 0) === 2, '탈락한 자리는 건너뛴다');
  // 2인: 예전 규칙 그대로
  const H = M.deal(9, 0, 2);
  H.hands = [[10, 11, 5], [20, 21, 22]]; H.pile = [4]; H.suit = 0;
  H.draw = Array.from({ length: 54 }, (_, i) => i).filter(i => ![10, 11, 5, 20, 21, 22, 4].includes(i));
  assert(M.play(H, 10) && H.turn === 0, '2인: J 는 한 번 더');
  assert(M.play(H, 11) && H.dir === 1 && H.turn === 1, '2인: Q 는 평범한 카드');
}
console.table(stat);
console.log('원카드 엔진 검사 통과');
