/* 화투 48장 그림 — 각 카드를 54×84 SVG 로 그린다. index.html 이 쓴다. */
(function (root) {
  const M = root.Matgo, C = id => M.CARDS[id];
  const CREAM = '#F3E7CB', INK = '#1A1410';
  const GREEN = '#2E7D3A', GREEN2 = '#4E9A4A', RED = '#C8322B', PINK = '#EC8FA8', PURPLE = '#6A3FA0', BLACK = '#1E1B1B', BROWN = '#7A4A26', YELLOW = '#E6B72E', ORANGE = '#DD6A2C', BLUE = '#3C6E9E';

  // 달별 바탕 그림 (네 장 공통)
  const PLANT = {
    1: `<path d="M2 84V52q10 4 12 16 4-12 14-8-2 10 8 12 4-6 16-4v16z" fill="${GREEN}"/><path d="M6 60l6 10M14 64l4 12M28 66l-2 12M40 72l4 10" stroke="#1D5A28" stroke-width="1.6"/><path d="M2 62q8-6 14 2" fill="none" stroke="#7CB86A" stroke-width="2"/>`,
    2: `<path d="M8 82C10 60 24 50 46 14" fill="none" stroke="${BROWN}" stroke-width="3" stroke-linecap="round"/><path d="M20 58c8 2 14-4 20-2" fill="none" stroke="${BROWN}" stroke-width="2"/>` + [[14, 70], [26, 52], [40, 32], [44, 18], [20, 44], [34, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${RED}"/><circle cx="${x}" cy="${y}" r="1.6" fill="#FFE39B"/>`).join(''),
    3: [[12, 68], [24, 76], [34, 60], [18, 50], [40, 44], [10, 36], [28, 34]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="3.2" ry="4.6" cx="0" cy="-4.2" transform="rotate(${a})" fill="${PINK}"/>`).join('')}<circle r="1.7" fill="#B5405E"/></g>`).join('') + `<path d="M6 80C20 60 28 46 46 10" fill="none" stroke="${BROWN}" stroke-width="2.4"/>`,
    4: [8, 20, 32, 44].map((x, i) => `<path d="M${x} 2v${44 + (i % 2) * 14}" stroke="#3B2F52" stroke-width="1.5"/>` + [0, 1, 2, 3, 4].map(k => `<ellipse cx="${x}" cy="${12 + k * 10 + (i % 2) * 4}" rx="4" ry="5.5" fill="${k % 2 ? '#4A3A66' : '#2B2238'}"/>`).join('')).join(''),
    5: `<path d="M10 84q2-30 8-44M24 84q-2-28 4-40M40 84q0-26 6-40" fill="none" stroke="${GREEN}" stroke-width="3"/><g fill="${PURPLE}"><path d="M18 40q-8-12 0-22 8 10 0 22z"/><path d="M18 40q-14-4-14-14 10 0 14 14z"/><path d="M18 40q14-4 14-14-10 0-14 14z"/><path d="M40 46q-6-10 0-18 6 8 0 18z"/><path d="M40 46q-10-2-12-10 8 0 12 10z"/></g><circle cx="18" cy="34" r="2" fill="${YELLOW}"/>`,
    6: `<path d="M12 84q4-26 14-34M30 84q-2-20 6-30" fill="none" stroke="${GREEN}" stroke-width="3"/><path d="M4 70q12-10 20 2-12 6-20-2zM44 76q-10-12-20-4 8 10 20 4z" fill="${GREEN2}"/><g transform="translate(27 38)">${[0, 60, 120, 180, 240, 300].map(a => `<ellipse rx="7" ry="11" cy="-9" transform="rotate(${a})" fill="${RED}"/>`).join('')}<circle r="5" fill="#F0A0A0"/><circle r="2" fill="${YELLOW}"/></g>`,
    7: `<path d="M10 84q6-30 20-52M28 84q4-26 16-46" fill="none" stroke="#7B3A22" stroke-width="2.2"/>` + [[16, 62], [22, 50], [30, 40], [36, 32], [26, 70], [38, 56], [44, 44], [12, 74]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="5" fill="#B94A2A"/><ellipse cx="${x + 6}" cy="${y + 2}" rx="3" ry="4.6" fill="#D2653A"/>`).join(''),
    8: `<path d="M2 84V58q14-14 30-10 12 2 20 12v24z" fill="${BLACK}"/><path d="M2 84V70q12-6 28-2 12 2 22 8v8z" fill="#3A3636"/>`,
    9: `<path d="M8 84q4-24 14-30M30 84q0-20 8-26" fill="none" stroke="${GREEN}" stroke-width="3"/><path d="M4 74q10-8 18 0-10 6-18 0zM46 80q-10-10-20-2 10 8 20 2z" fill="${GREEN2}"/>` + [[22, 40, 11], [40, 54, 8], [12, 54, 7]].map(([x, y, r]) => `<g transform="translate(${x} ${y})">${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => `<ellipse rx="${r * 0.28}" ry="${r}" cy="${-r * 0.55}" transform="rotate(${a})" fill="${YELLOW}"/>`).join('')}<circle r="${r * 0.35}" fill="#B9861E"/></g>`).join(''),
    10: `<path d="M12 84C14 60 30 40 46 12" fill="none" stroke="${BROWN}" stroke-width="2.4"/>` + [[12, 62, ORANGE], [30, 48, '#D9532B'], [22, 30, '#E8A03A'], [42, 30, ORANGE], [38, 66, '#D9532B'], [8, 40, '#E8A03A']].map(([x, y, c]) => `<path transform="translate(${x} ${y}) scale(0.9)" d="M0-9L2-3 8-4 4 1 8 6 2 5 0 10-2 5-8 6-4 1-8-4-2-3z" fill="${c}"/>`).join(''),
    11: `<path d="M2 84V60q12-18 26-14 14 2 24 18v20z" fill="${BLACK}"/><path d="M6 58q8-12 20-10M30 52q10 0 18 12" fill="none" stroke="#5B5555" stroke-width="1.5"/><path d="M8 56q6 8 14 4M32 50q8 6 12 2" fill="none" stroke="#5B5555" stroke-width="1.5"/>`,
    12: `<path d="M2 84V40q10-8 14 8 6 0 8-14 8 10 8 24 8-6 20 2v24z" fill="#7A9AAD"/>` + [6, 14, 22, 30, 38, 46].map(x => `<path d="M${x} 6v18M${x + 4} 30v14" stroke="#4F6B7D" stroke-width="1.4" stroke-linecap="round"/>`).join('') + `<path d="M4 2q22 0 46 0" stroke="#4F6B7D" stroke-width="0"/>`
  };
  // 광·열끗의 특별 그림
  const SPECIAL = {
    '1g': `<circle cx="38" cy="18" r="9" fill="${RED}"/><path d="M8 40q10-14 24-6-6 6-4 12-8 4-20-6z" fill="#FFFFFF" stroke="${INK}" stroke-width="1"/><path d="M30 34l8-6" stroke="${INK}" stroke-width="1.6"/><circle cx="31" cy="33" r="1.8" fill="${RED}"/>`,
    '2y': `<g transform="translate(16 26)"><ellipse rx="9" ry="6" fill="#8FBF4A"/><circle cx="8" cy="-3" r="4" fill="#8FBF4A"/><path d="M12-3l5 1-5 2z" fill="#E0A020"/><circle cx="9" cy="-4" r="1" fill="${INK}"/><path d="M-9 0l-6 4M-9 2l-5 6" stroke="#5C7D2E" stroke-width="1.5"/></g>`,
    '3g': `<path d="M4 44q12-8 23 0 11-8 23 0v38H4z" fill="#8C3F9C"/><path d="M8 50v30M16 50v30M24 50v30M32 50v30M40 50v30" stroke="#5A2266" stroke-width="1.4"/><path d="M4 44q12-8 23 0 11-8 23 0" fill="none" stroke="${RED}" stroke-width="2.4"/>`,
    '4y': `<g transform="translate(30 38)"><ellipse rx="9" ry="6" fill="#B25A3A"/><circle cx="-8" cy="-3" r="4" fill="#B25A3A"/><path d="M-12-3l-5 1 5 2z" fill="${INK}"/><circle cx="-9" cy="-4" r="1" fill="#FFF"/><path d="M9 0l6 3M9 2l5 5" stroke="#7A3A22" stroke-width="1.5"/></g>`,
    '5y': `<path d="M2 62l10-8h30l10 8v6H2z" fill="#9C6A3C"/><path d="M12 54l10-6h10l10 6" fill="none" stroke="#6E4623" stroke-width="2"/><path d="M14 54v14M26 48v20M38 54v14" stroke="#6E4623" stroke-width="2"/>`,
    '6y': `<g transform="translate(38 20)"><path d="M0 0q-12-14-14-2 2 8 14 2z" fill="${YELLOW}" stroke="${PURPLE}" stroke-width="1"/><path d="M0 0q12-14 14-2-2 8-14 2z" fill="${YELLOW}" stroke="${PURPLE}" stroke-width="1"/><path d="M0 0q-10 8-8 12 6 0 8-12z" fill="${PURPLE}"/><path d="M0 0q10 8 8 12-6 0-8-12z" fill="${PURPLE}"/><path d="M0-2v10" stroke="${INK}" stroke-width="1.5"/></g>`,
    '7y': `<g transform="translate(26 30)"><ellipse rx="15" ry="9" fill="${BLACK}"/><circle cx="14" cy="-2" r="6" fill="${BLACK}"/><path d="M18 1l5 2" stroke="#FFF" stroke-width="2"/><circle cx="16" cy="-4" r="1.2" fill="#FFF"/><path d="M-10 8v6M-2 8v6M6 8v6M12 6v7" stroke="${BLACK}" stroke-width="3"/></g>`,
    '8g': `<circle cx="28" cy="30" r="15" fill="#F5E6A8" stroke="${INK}" stroke-width="1.2"/>`,
    '8y': [[10, 18], [26, 12], [42, 20]].map(([x, y]) => `<path d="M${x - 7} ${y}q7-6 14 0" fill="none" stroke="${BLACK}" stroke-width="2.4" stroke-linecap="round"/>`).join(''),
    '9y': `<path d="M14 16h26l-4 14H18z" fill="${RED}"/><path d="M12 16h30" stroke="#8A1E18" stroke-width="2"/><path d="M18 30h18v4H18z" fill="#8A1E18"/><text x="27" y="26" font-size="7" font-weight="700" text-anchor="middle" fill="#FFF" font-family="serif">壽</text>`,
    '10y': `<g transform="translate(26 30)"><ellipse rx="13" ry="8" fill="#9A6A3E"/><path d="M8-6q6-2 8 6" fill="none" stroke="#9A6A3E" stroke-width="6" stroke-linecap="round"/><circle cx="16" cy="-2" r="4.5" fill="#9A6A3E"/><path d="M14-6l-3-10M16-6l2-10M13-12l-4-3M18-14l4-3" stroke="#5B3A1E" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="-3" r="1" fill="${INK}"/><path d="M-9 7v8M-3 7v8M4 7v8M10 7v8" stroke="#6E4623" stroke-width="2.4"/></g>`,
    '11g': `<g transform="translate(26 28)"><path d="M-14 8q-4-16 8-20 8-2 12 6 4-4 10 0-4 4-2 10-8 6-14 2-6 6-14 2z" fill="${YELLOW}" stroke="#8A6A10" stroke-width="1"/><path d="M-6-12q2-8 8-6-2 4 0 8z" fill="${RED}"/><circle cx="2" cy="-4" r="1.3" fill="${INK}"/><path d="M8 8q10 2 14 10M8 10q6 6 6 14" fill="none" stroke="${GREEN}" stroke-width="2.2"/></g>`,
    '12g': `<path d="M8 40q18-22 40 0z" fill="${RED}"/><path d="M28 40v30" stroke="${INK}" stroke-width="2"/><path d="M14 74q6-20 14-28 8 8 14 28z" fill="${BLACK}"/><circle cx="28" cy="42" r="4" fill="#F3D2B0"/>`,
    '12y': `<g transform="translate(24 18)"><path d="M-10 0q10-8 20 0l6 8-6-4-4 8-6-8-10 6z" fill="${BLACK}"/><circle cx="6" cy="-2" r="1" fill="#FFF"/></g>`
  };
  const RIBBON = { hong: ['#C9262E', '홍단'], cheong: ['#3A4F9C', '청단'], cho: ['#C9262E', '초단'], bi: ['#6B4E8A', ''] };

  function cardSvg(id) {
    const c = C(id);
    let body = PLANT[c.m] || '';
    if (c.t === 'g') body += SPECIAL[c.m + 'g'] || '';
    if (c.t === 'y') body += SPECIAL[c.m + 'y'] || '';
    if (c.t === 't') {
      const [col, txt] = RIBBON[c.sub];
      body += `<rect x="20" y="8" width="14" height="60" rx="2" fill="${col}" stroke="${INK}" stroke-width="0.8"/>` +
        (txt ? `<text x="27" y="26" font-size="9" font-weight="900" text-anchor="middle" fill="#FFF" font-family="'Gothic A1',sans-serif" writing-mode="tb" letter-spacing="2">${txt}</text>` : '');
    }
    if (c.t === 'p' && c.sub === 'ssang') body += `<rect x="30" y="6" width="20" height="14" rx="3" fill="${INK}"/><text x="40" y="16.5" font-size="9" font-weight="900" text-anchor="middle" fill="#FFF" font-family="'Gothic A1',sans-serif">쌍</text>`;
    if (c.t === 'g') body += `<circle cx="10" cy="74" r="7" fill="${RED}" stroke="#FFF" stroke-width="1.2"/><text x="10" y="77.5" font-size="9" font-weight="900" text-anchor="middle" fill="#FFF" font-family="serif">光</text>`;
    return `<svg viewBox="0 0 54 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="52" height="82" rx="4" fill="${CREAM}" stroke="${INK}" stroke-width="2"/><clipPath id="c${id}"><rect x="2" y="2" width="50" height="80" rx="3"/></clipPath><g clip-path="url(#c${id})">${body}</g><rect x="2.5" y="2.5" width="12" height="10" rx="2" fill="rgba(255,255,255,0.85)"/><text x="8.5" y="10.5" font-size="7.5" font-weight="900" text-anchor="middle" fill="${INK}" font-family="'Gothic A1',sans-serif">${c.m}</text></svg>`;
  }
  root.MatgoCards = { cardSvg };
})(typeof window !== 'undefined' ? window : globalThis);
