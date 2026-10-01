/* 한 판 놀이방 — 모든 페이지 공통: 바닥글, 광고 자리, 통계.
 * 페이지에는 <div class="ad-slot" data-ad="자리이름" hidden></div> 만 두면 된다.
 * config.js 에 값이 없으면 아무것도 불러오지 않는다. */
(function () {
  const cfg = window.HANPAN_CONFIG || {};
  // 게임 폴더 안(/reversi/ 등)이면 한 단계 위가 사이트 루트
  const root = document.documentElement.dataset.root || '';

  function footer() {
    const host = document.querySelector('.page') || document.body;
    const f = document.createElement('footer');
    f.className = 'site-footer';
    const home = document.createElement('a');
    home.href = root + 'index.html';
    home.textContent = cfg.siteName || '한 판 놀이방';
    const about = document.createElement('a');
    about.href = root + 'about.html';
    about.textContent = '소개';
    const privacy = document.createElement('a');
    privacy.href = root + 'privacy.html';
    privacy.textContent = '개인정보처리방침';
    f.append(home, about, privacy);
    host.appendChild(f);
  }

  function loadScript(src, attrs) {
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    for (const k in (attrs || {})) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
  }

  function ads() {
    const client = cfg.adsenseClient, slots = cfg.adSlots || {};
    if (!client) return;
    // 심사 중에는 광고 단위가 없어도 애드센스가 모든 페이지에서 스크립트·메타 태그를 찾는다
    const meta = document.createElement('meta');
    meta.name = 'google-adsense-account';
    meta.content = client;
    document.head.appendChild(meta);
    loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client), { crossorigin: 'anonymous' });
    const live = [...document.querySelectorAll('.ad-slot[data-ad]')].filter(el => slots[el.dataset.ad]);
    for (const el of live) {
      const label = document.createElement('span');
      label.className = 'ad-label';
      label.textContent = '광고';
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient = client;
      ins.dataset.adSlot = slots[el.dataset.ad];
      ins.dataset.adFormat = 'auto';
      ins.dataset.fullWidthResponsive = 'true';
      el.append(label, ins);
      el.hidden = false;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }

  function analytics() {
    const id = cfg.analyticsId;
    if (!id) return;
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  }

  // 좁은 화면에서는 설정 패널이 게임판 아래로 내려가 찾기 어렵다. 화면 위쪽에 바로가기 단추를 띄운다
  function settingsButton() {
    const panel = document.querySelector('aside.panel'), play = document.querySelector('.play');
    if (!panel || !play) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'to-settings';
    b.hidden = true;
    document.body.appendChild(b);
    let atPanel = false;
    const smooth = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
    function update() {
      const stacked = panel.getBoundingClientRect().top >= play.getBoundingClientRect().bottom - 4;   // 패널이 게임판 아래에 있는가
      b.hidden = !stacked;
      if (!stacked) return;
      atPanel = panel.getBoundingClientRect().top < window.innerHeight * 0.45;
      b.textContent = atPanel ? '↑ 게임판' : '설정 ↓';
      b.setAttribute('aria-label', atPanel ? '게임판으로 올라가기' : '놀이 설정으로 내려가기');
    }
    b.addEventListener('click', () => {
      if (atPanel) window.scrollTo({ top: 0, behavior: smooth() });
      else panel.scrollIntoView({ block: 'start', behavior: smooth() });
    });
    let tick = 0;
    const soon = () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; update(); }); };
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    update();
    setTimeout(update, 600);                                     // 글꼴·그림이 들어와 높이가 바뀐 뒤 한 번 더
  }

  function init() { footer(); settingsButton(); ads(); analytics(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
