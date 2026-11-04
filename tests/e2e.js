/* Uji menyeluruh di Chromium: aplikasi asli + Code.gs asli di atas tiruan layanan Google. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createGas, serve } = require('./mock-gas');
const XLSX = require('../docs/vendor/xlsx.full.min.js');

const WEB = path.join(__dirname, '../docs');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const files = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); res.end("window.APP_CONFIG={API_URL:'http://localhost:9102/exec',ALLOW_ANY_URL:true};"); return; }
  const f = path.join(WEB, p === '/' ? 'index.html' : p);
  if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

function makeFile(file) {
  const wb = XLSX.utils.book_new();
  const add = (n, r) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), n);
  add('TahunAjaran', [['tahun', 'semester', 'aktif'], ['2026/2027', 'Ganjil', 'Ya']]);
  add('Mapel', [['kode', 'nama_mapel'], ['M1', 'Fiqih'], ['M2', 'Bahasa Arab'], ['M3', 'Sejarah']]);
  add('Kelas', [['nama_kelas', 'tingkat'], ['VII-A', ''], ['VIII-A', '']]);
  const siswa = [['nisn', 'nis', 'nama', 'jk', 'kelas', 'status']];
  for (let i = 0; i < 450; i += 1) siswa.push([String(10000000 + i).padStart(10, '0'), String(100 + i), `Siswa Uji ${i}`, i % 2 ? 'L' : 'P', i % 2 ? 'VII-A' : 'VIII-A', '']);
  siswa.push(['0099999999', '', 'Baris Salah', 'L', 'IX-Z', '']);
  add('Siswa', siswa);
  add('Pengampuan', [['mapel', 'kelas', 'kktp'], ['Fiqih', 'VII-A', '75'], ['Sejarah', 'VIII-A', '70']]);
  add('Jadwal', [['mapel', 'kelas', 'hari', 'jam_mulai', 'jam_selesai'], ['Fiqih', 'VII-A', 'Senin', '07:30', '09:00']]);
  fs.writeFileSync(file, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}

(async () => {
  const gas = createGas();
  gas.sandbox.setup();
  const pin = gas.pin();
  const api = await serve(gas, 9102);
  await new Promise((ok) => files.listen(9101, ok));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_INTERNET|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const sheet = (n) => gas.sheets.get(n).rows.length - 1;
  const live = (n) => { const r = gas.sheets.get(n).rows; const d = r[0].indexOf('deleted'); return r.slice(1).filter((x) => x[d] === '0').length; };

  await page.goto('http://localhost:9101/');
  await page.fill('#connect-pin', '000001');
  await page.getByRole('button', { name: 'Hubungkan', exact: true }).click();
  await page.getByText('PIN salah.').waitFor();
  await page.fill('#connect-pin', pin);
  await page.getByRole('button', { name: 'Hubungkan', exact: true }).click();
  await page.getByText('Kesiapan data').waitFor();
  console.log('ok login');

  // Import Lengkap
  const file = path.join(SHOTS, 'uji-import.xlsx');
  makeFile(file);
  await page.getByRole('button', { name: 'Import Lengkap' }).click();
  await page.setInputFiles('#import-file', file);
  await page.getByRole('button', { name: /^Simpan 459 baris/ }).waitFor();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'real-review.png') });
  await page.getByRole('button', { name: /^Simpan 459 baris/ }).click();
  await page.getByText('459 baris tersimpan').waitFor();
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Tersimpan') && !document.body.innerText.includes('Menunggu kirim'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.equal(sheet('Siswa'), 450);
  assert.equal(sheet('AnggotaKelas'), 450);
  assert.equal(sheet('Jadwal'), 1);
  assert.equal(sheet('ImportLog'), 1);
  assert.ok(gas.sheets.get('Siswa').rows.some((r) => r.includes('0010000000')), 'nol di depan hilang');
  console.log('ok import 450 siswa ke spreadsheet, batch terkirim');

  // Offline: buka ulang dari cache, ubah data, sinkron saat online
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.fill('#unlock-pin', pin);
  await page.getByText('Kesiapan data').waitFor();
  await ctx.setOffline(true);
  await page.reload();
  await page.fill('#unlock-pin', pin);
  await page.getByText('Kesiapan data').waitFor();
  console.log('ok aplikasi terbuka saat offline');
  await page.getByRole('button', { name: 'Data Master' }).click();
  await page.getByRole('button', { name: 'Mapel', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah' }).click();
  await page.fill('#f-nama_mapel', 'Mapel Offline');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByText('Mapel Offline').waitFor();
  await page.waitForTimeout(600);
  assert.equal(sheet('Mapel'), 3);
  await page.getByText('Offline', { exact: true }).first().waitFor();
  await ctx.setOffline(false);
  await page.waitForFunction(() => document.querySelector('.side-foot .sync-pill.good'), null, { timeout: 15000 });
  assert.equal(sheet('Mapel'), 4);
  console.log('ok perubahan offline terkirim saat online');

  // Perangkat kedua menerima data yang sama
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:9101/');
  await p2.fill('#connect-pin', pin);
  await p2.getByRole('button', { name: 'Hubungkan', exact: true }).click();
  await p2.getByText('Kesiapan data').waitFor();
  await p2.getByText('450 siswa di kelas').waitFor();
  const w = await p2.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(w[0] <= w[1], `lebar berlebih ${w}`);
  console.log('ok perangkat kedua menarik semua data');

  // Batalkan import
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByRole('button', { name: 'Batalkan', exact: true }).click();
  await page.getByRole('button', { name: 'Batalkan import' }).click();
  await page.getByText(/dihapus, 0 dikembalikan/).waitFor();
  await page.waitForFunction(() => document.querySelector('.side-foot .sync-pill.good'), null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  assert.equal(live('Siswa'), 0);
  assert.equal(live('Mapel'), 1);
  assert.equal(live('TahunAjaran'), 0);
  console.log('ok batalkan import');

  // Sesi berakhir: data tertahan, lalu masuk ulang
  await ctx.setOffline(false);
  gas.raw.delete('sessions');
  await page.getByRole('button', { name: 'Data Master' }).click();
  await page.getByRole('button', { name: 'Tambah' }).click();
  await page.fill('#f-nama_mapel', 'Setelah Sesi Habis');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByText('Sesi berakhir. Data menunggu dikirim.').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Masukkan PIN' }).click();
  await page.fill('#relogin-pin', pin);
  await page.getByRole('button', { name: 'Sambungkan' }).click();
  await page.waitForFunction(() => document.querySelector('.side-foot .sync-pill.good'), null, { timeout: 15000 });
  assert.equal(sheet('Mapel'), 5);
  console.log('ok sesi berakhir lalu tersambung lagi tanpa kehilangan data');

  assert.deepEqual(errors, []);
  await browser.close(); api.close(); files.close();
  console.log('SEMUA LULUS');
})().catch((e) => { console.error('GAGAL', e); process.exit(1); });
