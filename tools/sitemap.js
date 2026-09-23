// 사용: node tools/sitemap.js https://사이트주소/   → sitemap.xml 과 robots.txt 의 Sitemap 줄을 다시 쓴다
const fs = require('fs');
const base = (process.argv[2] || 'https://subin195-09.github.io/hanpan/').replace(/\/?$/, '/');
const games = require('vm').runInNewContext(fs.readFileSync('games.js', 'utf8') + '; window.HANPAN_GAMES', { window: {} });
const pages = ['', 'about.html', 'privacy.html', ...games.map(g => g.id + '/')];
const today = new Date().toISOString().slice(0, 10);
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(p => '  <url><loc>' + base + p + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') + '\n</urlset>\n';
fs.writeFileSync('sitemap.xml', xml);
fs.writeFileSync('robots.txt', 'User-agent: *\nAllow: /\nSitemap: ' + base + 'sitemap.xml\n');
console.log('sitemap.xml + robots.txt →', base, pages.length + ' pages');
