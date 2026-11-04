/* node --test tests/logic.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { createGas } = require('./mock-gas');

const XLSX = require(process.env.XLSX_PATH);
for (const f of ['schema', 'importer', 'sample']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, `../docs/js/${f}.js`), 'utf8'));
const { Importer, Sample } = globalThis.GM;

function sampleDb() {
  const db = {};
  Object.keys(GM.Schema.TABLES).forEach((t) => { db[t] = []; });
  Sample.build().forEach(({ table, row }) => db[table].push(row));
  db.Pengaturan = [{ key: 'default_kktp', value: '75' }];
  return db;
}
const roundTrip = (wb) => XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });

test('file latihan: status tiap baris sesuai', () => {
  const parts = Importer.readParts(XLSX, roundTrip(Sample.practiceBook(XLSX)), 'lengkap');
  const a = Importer.analyze(parts, sampleDb(), { mode: 'lewati' });
  const by = Object.fromEntries(a.parts.map((p) => [p.kind, p]));
  assert.deepEqual(by.siswa.rows.map((r) => r.status), ['sama', 'berubah', 'baru', 'baru', 'masalah', 'masalah', 'cek']);
  assert.match(by.siswa.rows[4].errors[0], /NISN harus 10/);
  assert.match(by.siswa.rows[5].errors[0], /Kelas VII-C belum terdaftar/);
  assert.equal(by.kelas.rows[1].status, 'baru');
  assert.equal(by.pengampuan.rows[0].status, 'baru');
  assert.match(by.pengampuan.rows[1].errors[0], /berjumlah 100/);
  assert.equal(by.jadwal.rows[0].status, 'baru');
  assert.equal(by.jadwal.rows[0].data.jam_mulai, '08.00');
  assert.match(by.jadwal.rows[1].errors[0], /Bentrok/);
});

test('mode perbarui memindahkan data, mode lewati tidak', () => {
  const parts = Importer.readParts(XLSX, roundTrip(Sample.practiceBook(XLSX)), 'lengkap');
  const skip = Importer.analyze(parts, sampleDb(), { mode: 'lewati' });
  const upd = Importer.analyze(parts, sampleDb(), { mode: 'perbarui' });
  const changed = (a) => a.ops.filter((o) => o.table === 'Siswa' && o.before).length;
  assert.equal(changed(skip), 0);
  assert.equal(changed(upd), 1);
});

test('baris tanpa nomor identitas hanya tersimpan setelah dicentang', () => {
  const parts = Importer.readParts(XLSX, roundTrip(Sample.practiceBook(XLSX)), 'lengkap');
  const no = Importer.analyze(parts, sampleDb(), {});
  const row = no.parts.find((p) => p.kind === 'siswa').rows.find((r) => r.status === 'cek');
  const yes = Importer.analyze(parts, sampleDb(), { confirmed: new Set([`siswa:${row.no}`]) });
  assert.equal(yes.ops.filter((o) => o.table === 'Siswa').length, no.ops.filter((o) => o.table === 'Siswa').length + 1);
});

test('analisis tidak mengubah db asli', () => {
  const db = sampleDb();
  const before = JSON.stringify(db);
  Importer.analyze(Importer.readParts(XLSX, roundTrip(Sample.practiceBook(XLSX)), 'lengkap'), db, { mode: 'perbarui' });
  assert.equal(JSON.stringify(db), before);
});

test('NISN teks mempertahankan nol, CSV titik koma terbaca, kop sekolah dilewati', () => {
  const csv = 'nisn;nis;nama;jk;kelas\n0012345678;0007;Ani Putri;P;VII-A\n';
  const wb = Importer.readBook(XLSX, new TextEncoder().encode(csv).buffer, 'siswa.csv');
  const parts = Importer.readParts(XLSX, wb, 'siswa');
  assert.equal(parts[0].rows[0].data.nisn, '0012345678');
  assert.equal(parts[0].rows[0].data.nis, '0007');

  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['SMP Contoh'], ['Daftar Siswa'], [], ['No', 'NISN', 'Nama Siswa', 'L/P', 'Rombel'], [1, '0098765432', 'Budi', 'L', 'VII-A']]), 'Data');
  const p2 = Importer.readParts(XLSX, roundTrip(wb2), 'siswa');
  assert.equal(p2[0].rows[0].no, 5);
  assert.equal(p2[0].rows[0].data.nama, 'Budi');
  assert.equal(p2[0].rows[0].data.jk, 'L');
});

test('kolom wajib hilang dilaporkan, template terbaca kembali', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['nama', 'kelas'], ['A', 'B']]), 'x');
  assert.deepEqual(Importer.readParts(XLSX, wb, 'siswa')[0].missing, ['jk']);
  const tpl = roundTrip(Importer.template(XLSX, 'lengkap'));
  assert.deepEqual(tpl.SheetNames, ['Petunjuk', 'TahunAjaran', 'Mapel', 'Kelas', 'Siswa', 'Pengampuan', 'Jadwal']);
  const parts = Importer.readParts(XLSX, tpl, 'lengkap');
  assert.equal(parts.length, 6);
  assert.ok(parts.every((p) => p.rows.length === 0 && p.missing.length === 0));
});

test('normalisasi jam', () => {
  assert.equal(Importer.normTime(0.3125), '07:30');
  assert.equal(Importer.normTime('7.30'), '07:30');
  assert.equal(Importer.normTime('1:15 PM'), '13:15');
  assert.equal(Importer.normTime('25:00'), '');
});

test('hanya satu tahun ajaran aktif setelah import', () => {
  const part = { kind: 'tahun', sheetName: 'x', missing: [], rows: [{ no: 2, data: { tahun: '2026/2027', semester: 'Genap', aktif: 'Ya' } }] };
  const a = Importer.analyze([part], sampleDb(), {});
  const yearOps = a.ops.filter((o) => o.table === 'TahunAjaran');
  assert.equal(yearOps.length, 2);
  assert.equal(yearOps.filter((o) => o.row.aktif === '1').length, 1);
});

/* ---------- Backend ---------- */
function ready() {
  const gas = createGas();
  gas.sandbox.setup();
  const token = gas.post({ action: 'login', pin: gas.pin() }).token;
  return { gas, token };
}
const row = (id, nama, updated) => ({ id_mapel: id, kode: '', nama_mapel: nama, updated_at: updated, created_at: updated, deleted: '0', device_id: 'd', id_import: '' });

test('setup membuat semua sheet dan aman dijalankan ulang', () => {
  const { gas } = ready();
  const pin = gas.raw.get('pin_hash');
  assert.equal(gas.sheets.size, 15);
  gas.sandbox.setup();
  assert.equal(gas.raw.get('pin_hash'), pin);
  assert.ok(gas.sheets.get('Siswa').rows[0].includes('_rev'));
});

test('tanpa token data tertutup, PIN salah terkunci setelah 5 kali', () => {
  const { gas } = ready();
  assert.equal(gas.post({ action: 'pull', since: 0 }).code, 'AUTH');
  assert.equal(gas.post({ action: 'push', rows: [], token: 'palsu' }).code, 'AUTH');
  for (let i = 0; i < 5; i += 1) assert.equal(gas.post({ action: 'login', pin: '000001' }).code, 'BAD_PIN');
  assert.equal(gas.post({ action: 'login', pin: gas.pin() }).code, 'LOCKED');
});

test('kirim ulang tidak menggandakan, versi lama ditolak, hapus ikut tersinkron', () => {
  const { gas, token } = ready();
  const one = { table: 'Mapel', row: row('m1', 'IPA', '2026-11-04T01:00:00.000Z') };
  assert.equal(gas.post({ action: 'push', token, rows: [one] }).results[0].status, 'ok');
  assert.equal(gas.post({ action: 'push', token, rows: [one] }).results[0].status, 'ok');
  assert.equal(gas.sheets.get('Mapel').rows.length, 2);
  assert.equal(gas.post({ action: 'push', token, rows: [{ table: 'Mapel', row: row('m1', 'IPS', '2026-11-04T00:00:00.000Z') }] }).results[0].status, 'stale');
  gas.post({ action: 'push', token, rows: [{ table: 'Mapel', row: { ...row('m1', 'IPA', '2026-11-04T02:00:00.000Z'), deleted: '1' } }] });
  const pulled = gas.post({ action: 'pull', token, since: 0 });
  assert.equal(pulled.rows.length, 1);
  assert.equal(pulled.rows[0].row.deleted, '1');
  assert.equal(gas.post({ action: 'pull', token, since: pulled.next }).rows.length, 0);
});

test('nol di depan bertahan dan rumus tidak pernah ditulis mentah', () => {
  const { gas, token } = ready();
  const res = gas.post({ action: 'push', token, rows: [{ table: 'Siswa', row: { id_siswa: 's1', nisn: '0012345678', nama: '=IMPORTXML("http://x","//a")', jk: 'L', status: 'Aktif', updated_at: '2026-11-04T01:00:00.000Z', deleted: '0' } }] });
  assert.equal(res.results[0].status, 'ok');
  const got = gas.post({ action: 'pull', token, since: 0 }).rows[0].row;
  assert.equal(got.nisn, '0012345678');
  assert.equal(got.nama, '=IMPORTXML("http://x","//a")');
  gas.rawWrites.filter((v) => typeof v === 'string' && /^[=+\-@0-9]/.test(v) && !['key'].includes(v)).forEach((v) => {
    assert.fail(`Nilai mentah tertulis: ${v}`);
  });
});

test('tabel tak dikenal dan kolom asing ditolak, _rev tidak bisa dipalsukan', () => {
  const { gas, token } = ready();
  const res = gas.post({ action: 'push', token, rows: [{ table: '__proto__', row: {} }, { table: 'Mapel', row: { ...row('m2', 'X', '2026-11-04T01:00:00.000Z'), _rev: '99999', jahat: '1' } }] });
  assert.equal(res.results[0].status, 'failed');
  const got = gas.post({ action: 'pull', token, since: 0 }).rows[0].row;
  assert.equal(got._rev, '1');
  assert.equal(got.jahat, undefined);
});

test('tarik data bertahap tanpa ada baris yang terlewat', () => {
  const { gas, token } = ready();
  for (let b = 0; b < 8; b += 1) {
    const rows = Array.from({ length: 300 }, (_, i) => ({ table: b % 2 ? 'Kelas' : 'Mapel', row: b % 2
      ? { id_kelas: `k${b}-${i}`, nama_kelas: 'x', updated_at: '2026-11-04T01:00:00.000Z' }
      : row(`m${b}-${i}`, 'x', '2026-11-04T01:00:00.000Z') }));
    gas.post({ action: 'push', token, rows });
  }
  const ids = new Set();
  let since = 0; let pages = 0;
  for (;;) {
    const r = gas.post({ action: 'pull', token, since });
    r.rows.forEach((x) => ids.add(x.row.id_mapel || x.row.id_kelas));
    since = r.next; pages += 1;
    if (!r.hasMore) break;
  }
  assert.equal(ids.size, 2400);
  assert.equal(pages, 3);
});

test('ganti PIN mencabut sesi lain, PIN mudah ditolak', () => {
  const { gas, token } = ready();
  const other = gas.post({ action: 'login', pin: gas.pin() }).token;
  assert.equal(gas.post({ action: 'changePin', token, old_pin: gas.pin(), new_pin: '111111' }).code, 'WEAK_PIN');
  const res = gas.post({ action: 'changePin', token, old_pin: gas.pin(), new_pin: '482913' });
  assert.ok(res.ok);
  assert.equal(gas.post({ action: 'pull', token: other, since: 0 }).code, 'AUTH');
  assert.ok(gas.post({ action: 'pull', token: res.token, since: 0 }).ok);
  assert.ok(gas.post({ action: 'login', pin: '482913' }).ok);
});
