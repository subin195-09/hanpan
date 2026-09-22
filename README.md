# 한 판 놀이방

설치·로그인 없이 브라우저에서 바로 두는 보드게임 모음. 빌드 과정이 없는 정적 사이트라서 폴더를 그대로 어느 호스팅(GitHub Pages, Cloudflare Pages, Vercel, S3+CloudFront)에 올려도 동작한다.

```
index.html        놀이방 첫 화면 — games.js 목록으로 그려진다
games.js          게임 목록 (게임 추가 시 한 항목 추가)
privacy.html      개인정보처리방침
shared/
  config.js       사이트 설정 — 광고·통계를 켤 때 이 파일만 고친다
  online.js       온라인 2인 공용 모듈 (PeerJS WebRTC: 방 만들기/참가/재접속/동기화)
  site.js         공통 바닥글, 광고 자리 채우기, 통계
  site.css        공통 스타일 (돌아가기 링크, 바닥글, 광고 자리)
reversi/ omok/ yut/ alkkagi/ matgo/   (spot/ 은 목록에서 뺀 틀린그림찾기 — games.js에 다시 넣으면 살아난다)
  index.html      게임 한 개 = HTML 파일 한 개 (디자인·규칙·AI 모두 이 안에)
  thumb.svg       놀이방 목록에 보이는 판 그림 (정사각형)
```

게임 목록: 리버시 · 오목 · 윷놀이(힘 조절 던지기, 너무 세면 낙) · 장기 알까기(말마다 크기·무게가 다른 물리) · 맞고(규칙 엔진 `matgo/engine.js`는 node 테스트와 화면이 같이 씀, AI·온라인만).

## 게임 추가하는 법

1. 폴더를 만든다: `새게임/index.html`, `새게임/thumb.svg`. 기존 게임(가장 단순한 것은 `omok/`)을 복사해서 시작하면 빠르다.
2. `games.js`에 항목을 추가한다: `{ id: '새게임', title, blurb, meta, online: true }`. `id`는 폴더 이름과 같아야 한다.
3. 페이지에 넣어야 하는 공통 요소:
   - `<html lang="ko" data-root="../">`
   - `<link rel="stylesheet" href="../shared/site.css">`
   - `<a class="home" href="../index.html">← 한 판 놀이방</a>`
   - 설정 패널 끝에 `<div class="ad-slot" data-ad="game-side" hidden></div>`
   - 스크립트 순서: PeerJS → `../shared/config.js` → `../shared/online.js` → `../shared/site.js` → 게임 스크립트
   - CSS 토큰 `--ink`, `--ink-soft`, `--line`을 정의할 것 (공통 스타일이 쓴다)
4. 온라인 2인은 `Hanpan.createOnline({...})` 설정만 쓰면 된다. 사용법은 `shared/online.js` 맨 위 주석 참고. 요점:
   - 설정 패널에 빈 `<fieldset id="fs-online" hidden></fieldset>`을 두고 `O.mountPanel(...)`
   - 시작할 때 `if (!O.boot(saved && saved.room)) { 평소처럼 시작 }`
   - 내 수를 둔 뒤 `O.send()`, 상대 상태는 `onState`에서 **검증 후** 반영
   - `O.status === 'live' && 차례 === O.my`일 때만 입력 허용

## 광고·통계 켜는 법

`shared/config.js`만 고친다.

1. 애드센스 승인 후 `adsenseClient`에 `ca-pub-…`를 넣는다.
2. 광고 단위를 만들어 슬롯 번호를 `adSlots`에 넣는다 (`hub-bottom`: 첫 화면, `game-side`: 게임 화면). 번호가 빈 자리는 계속 숨겨진다.
3. 사이트 루트에 `ads.txt`를 추가한다.
4. 방문 통계는 `analyticsId`에 GA 측정 ID를 넣는다.

값이 비어 있는 동안에는 광고·통계 스크립트를 전혀 불러오지 않는다. 광고 자리를 더 만들려면 원하는 위치에 `<div class="ad-slot" data-ad="이름" hidden></div>`를 두고 `adSlots`에 같은 이름을 추가한다.

## 도메인을 붙일 때

모든 링크가 상대 경로라서 코드 수정은 필요 없다. 도메인이 정해지면 `sitemap.xml`과 `robots.txt`를 루트에 추가하고, 각 페이지의 `og:image`를 절대 주소(PNG 권장)로 바꾸면 공유 미리보기가 잘 나온다.
