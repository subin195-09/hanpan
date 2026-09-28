/* 고스톱 엔진 검사: 둘(맞고)·셋 모두 AI 끼리 수천 판 돌려 화투 48장 보존·종료·누적 점수 합 0 을 확인한다.  node tools/test-gostop.js */
require('../gostop/engine.js');
const M = globalThis.GoStop;
const assert = (c, m) => { if (!c) throw new Error(m); };
function check(G, tag) {
  const all = [].concat(G.deck, G.floor, ...G.hands, ...G.caps);
  const P = G.pend;
  if (P) { all.push(...P.take); if (P.hold) all.push(...P.hold); if (P.pick) all.push(P.pick.card); }
  assert(all.length === 48 && new Set(all).size === 48, tag + ': 패 수 ' + all.length + ' (' + G.stage + ')');
  assert(G.turn >= 0 && G.turn < G.n && G.hands.length === G.n && G.caps.length === G.n, tag + ': 차례·자리');
  assert(G.total.reduce((a, b) => a + b, 0) === 0, tag + ': 누적 합 ' + G.total);
  assert(G.coins.length === G.n && G.coins.every(c => Number.isInteger(c) && c >= 0), tag + ': 코인 ' + G.coins);
  assert(G.coins.reduce((a, b) => a + b, 0) === M.START * (G.n + G.bust.reduce((a, b) => a + b, 0)), tag + ': 코인 합 ' + G.coins + ' 파산 ' + G.bust);
  if (!G.over) assert(G.coins.every(c => c > 0), tag + ': 빈손으로 치는 사람 ' + G.coins);
}
{
  const G = M.deal(7, 1, 0, null, 3);
  assert(G.hands.length === 3 && G.hands.every(h => h.length === 7) && G.floor.length === 6 && G.deck.length === 21 && G.turn === 1, '셋: 7장씩, 바닥 6장, 더미 21장');
  const H = M.deal(7, 1, 0, null, 2);
  assert(H.hands.length === 2 && H.hands.every(h => h.length === 10) && H.floor.length === 8 && H.deck.length === 20 && H.turn === 1, '둘: 10장씩, 바닥 8장, 더미 20장');
}
const rows = {};
for (const n of [2, 3]) {
const stat = { 파산: 0, 판: 0, 나가리: 0, 고: 0, 고박: 0, 피박: 0, 광박: 0, 흔들기폭탄: 0, 최고점: 0, 승: Array(n).fill(0), 평균점: 0 };
let total = Array(n).fill(0), first = 0, carry = 0, sum = 0, bank = null;
for (let g = 0; g < 5000; g++) {
  const G = M.deal(1 + g * 13, first, carry, total, n, bank);
  check(G, n + '인 판 ' + g + ' 시작');
  const level = ['easy', 'normal', 'hard'][g % 3];
  let steps = 0;
  while (!G.over && steps < 400) {
    let ok = false;
    const before = G.turn;
    if (G.stage === 'play') { const a = M.aiPlay(G, level); ok = M.play(G, a.card, a.shake); }
    else if (G.stage === 'shake') ok = M.play(G, G.pend.played, Math.random() < 0.7);
    else if (G.stage === 'pick') ok = M.pick(G, M.aiPick(G));
    else if (G.stage === 'go') { const go = M.aiGo(G, level); if (go) stat.고++; ok = M.decideGo(G, go); }
    assert(ok, n + '인 판 ' + g + ': 수가 거절됨 (' + G.stage + ')');
    check(G, n + '인 판 ' + g + ' 수 ' + steps);
    if (!G.over && G.stage === 'play' && G.turn !== before) assert(G.turn === (before + 1) % n, '판 ' + g + ': 차례 순서');
    steps++;
  }
  assert(G.over, n + '인 판 ' + g + ': 안 끝남');
  stat.판++;
  if (G.winner < 0) { stat.나가리++; carry = G.carry + 1; assert(G.deck.length === 0, '나가리인데 더미가 남음'); }
  else {
    const R = G.result;
    assert(R.pays.length === n - 1 && R.pays.reduce((a, p) => a + p.owe, 0) === R.pts && R.pts >= 3, '판 ' + g + ': 셈 ' + JSON.stringify(R));
    assert(R.pays.reduce((a, p) => a + p.coin, 0) === R.coin && R.pays.every(p => p.coin <= p.owe * M.RATE), '판 ' + g + ': 코인 셈 ' + JSON.stringify(R));
    assert(M.best(G.caps[G.winner]).s >= 3, '판 ' + g + ': 3점 미만으로 남');
    if (R.pays.some(p => p.tags.includes('고박'))) { stat.고박++; if (n === 3) assert(R.pays.some(p => p.owe === 0), '셋: 고박이면 한 사람은 면제'); }
    if (R.pays.some(p => p.tags.includes('피박'))) stat.피박++;
    if (R.pays.some(p => p.tags.includes('광박'))) stat.광박++;
    if (G.mult[G.winner]) stat.흔들기폭탄++;
    stat.최고점 = Math.max(stat.최고점, R.pts);
    stat.승[G.winner]++; sum += R.pts;
    first = G.winner; carry = 0;
  }
  total = G.total; bank = { coins: G.coins, bust: G.bust };
  if (g % 500 === 499) { stat.파산 += G.bust.reduce((a, b) => a + b, 0); total = Array(n).fill(0); first = g % n; bank = null; }
}
stat.평균점 = Math.round(sum / (stat.판 - stat.나가리) * 10) / 10;
stat.승 = stat.승.join('/');
rows[n + '인'] = stat;
}
console.table(rows);
console.log('고스톱 엔진 검사 통과');
