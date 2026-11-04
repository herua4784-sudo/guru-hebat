/* Menggabungkan aplikasi menjadi satu halaman versi coba. */
const fs = require('fs');
const path = require('path');
const web = path.join(__dirname, '../docs');
const out = process.argv[2];
const css = fs.readFileSync(path.join(web, 'styles.css'), 'utf8')
  .replace(/\.page \{([^}]*)\}/, (m) => m);
const js = ['schema', 'store', 'sync', 'importer', 'sample', 'app'].map((f) => fs.readFileSync(path.join(web, `js/${f}.js`), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('script tag in source');
const page = `<title>Guru Mapel</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@e965/xlsx@0.20.3/dist/xlsx.full.min.js"></script>
<script>window.GM_DEMO = true; window.APP_CONFIG = {};</script>
<script>${js}</script>
`;
fs.writeFileSync(out, page);
console.log('demo', (page.length / 1024).toFixed(0), 'KB');
