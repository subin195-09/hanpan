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
    const privacy = document.createElement('a');
    privacy.href = root + 'privacy.html';
    privacy.textContent = '개인정보처리방침';
    f.append(home, privacy);
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
    const live = [...document.querySelectorAll('.ad-slot[data-ad]')].filter(el => slots[el.dataset.ad]);
    if (!live.length) return;
    loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client), { crossorigin: 'anonymous' });
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

  function init() { footer(); ads(); analytics(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
