/* 한 판 놀이방 — 사이트 설정. 광고·통계를 켤 때 이 파일만 고치면 된다.
 *
 * 광고 켜는 법 (애드센스 승인 후):
 *   1. adsenseClient 에 'ca-pub-숫자' 를 넣는다.
 *   2. 애드센스에서 광고 단위를 만들고, 그 슬롯 번호를 adSlots 에 넣는다.
 *      번호가 빈 자리는 계속 숨겨져 있다.
 *   3. 사이트 루트에 ads.txt 를 추가한다 (애드센스가 내용을 알려 준다).
 */
window.HANPAN_CONFIG = {
  siteName: '한 판 놀이방',
  adsenseClient: '',
  adSlots: {
    'hub-bottom': '',     // 놀이방 첫 화면, 게임 목록 아래
    'game-side': ''       // 각 게임 화면, 설정 패널 아래
  },
  analyticsId: ''         // Google Analytics 측정 ID (G-XXXXXXX). 비우면 통계 없음
};
