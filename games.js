/* 한 판 놀이방 — 게임 목록. 놀이방 첫 화면과 "초대 코드로 참가"가 이 목록으로 그려진다.
 * 게임을 추가하려면: 폴더를 만들고(index.html + thumb.svg) 여기에 한 항목을 추가한다. */
window.HANPAN_GAMES = [
  {
    id: 'reversi',
    title: '리버시',
    blurb: '상대 돌을 사이에 끼워 뒤집는 8×8 전략 게임. 마지막 한 수까지 역전이 나옵니다.',
    meta: '한 판 10~15분 · 수읽기',
    online: true
  },
  {
    id: 'omok',
    title: '오목',
    blurb: '15×15 판에서 돌 다섯 개를 먼저 한 줄로 이으면 승리. 규칙은 쉽고 승부는 빠릅니다.',
    meta: '한 판 5~10분 · 수읽기',
    online: true
  },
  {
    id: 'yut',
    title: '윷놀이',
    blurb: '윷을 던져 말 네 개를 먼저 내보내는 놀이. 업고, 잡고, 빽도에 울고 웃습니다.',
    meta: '한 판 10~20분 · 운 반 전략 반',
    online: true
  }
];
