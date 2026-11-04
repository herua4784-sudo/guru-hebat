/**
 * Guru Mapel - backend Google Apps Script
 * Spreadsheet adalah database utama. Skrip ini hanya bisa diakses dengan
 * token sesi yang didapat setelah login PIN.
 *
 * Pemasangan: lihat README.md. Jalankan setup() satu kali dari editor.
 */

var APP_VERSION = '1.2.0';
var META_COLS = ['created_at', 'updated_at', 'deleted', 'device_id', 'id_import', '_rev'];
var SCHEMA = {
  Pengaturan:   { pk: 'key',           cols: ['key', 'value'] },
  TahunAjaran:  { pk: 'id_tahun',      cols: ['id_tahun', 'tahun', 'semester', 'aktif'] },
  Mapel:        { pk: 'id_mapel',      cols: ['id_mapel', 'kode', 'nama_mapel'] },
  Kelas:        { pk: 'id_kelas',      cols: ['id_kelas', 'nama_kelas', 'tingkat'] },
  Siswa:        { pk: 'id_siswa',      cols: ['id_siswa', 'nis', 'nisn', 'nama', 'jk', 'status'] },
  AnggotaKelas: { pk: 'id_anggota',    cols: ['id_anggota', 'id_tahun', 'id_kelas', 'id_siswa'] },
  Pengampuan:   { pk: 'id_pengampuan', cols: ['id_pengampuan', 'id_tahun', 'id_mapel', 'id_kelas', 'kktp', 'bobot_formatif', 'bobot_sumatif'] },
  Jadwal:       { pk: 'id_jadwal',     cols: ['id_jadwal', 'id_pengampuan', 'hari', 'jam_mulai', 'jam_selesai', 'jam_ke'] },
  Pertemuan:    { pk: 'id_pertemuan',  cols: ['id_pertemuan', 'id_pengampuan', 'tanggal', 'pertemuan_ke', 'id_tp'] },
  Presensi:     { pk: 'id_presensi',   cols: ['id_presensi', 'id_pertemuan', 'id_siswa', 'status', 'keterangan'] },
  Jurnal:       { pk: 'id_jurnal',     cols: ['id_jurnal', 'id_pertemuan', 'materi', 'kegiatan', 'catatan'] },
  TP:           { pk: 'id_tp',         cols: ['id_tp', 'id_mapel', 'tingkat', 'kode_tp', 'deskripsi', 'urutan', 'target_pertemuan', 'tautan_modul'] },
  Penilaian:    { pk: 'id_penilaian',  cols: ['id_penilaian', 'id_pengampuan', 'id_tp', 'jenis', 'nama', 'tanggal', 'nilai_maks'] },
  Nilai:        { pk: 'id_nilai',      cols: ['id_nilai', 'id_penilaian', 'id_siswa', 'nilai', 'remedial', 'catatan'] },
  CatatanSiswa: { pk: 'id_catatan',    cols: ['id_catatan', 'id_siswa', 'id_pengampuan', 'tanggal', 'kategori', 'isi', 'tindak_lanjut', 'status'] },
  BankSoal:     { pk: 'id_soal',       cols: ['id_soal', 'id_mapel', 'tingkat', 'id_tp', 'tipe', 'kesulitan', 'soal', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci', 'pembahasan'] },
  Kalender:     { pk: 'id_kalender',   cols: ['id_kalender', 'judul', 'jenis', 'tanggal_mulai', 'tanggal_selesai', 'keterangan'] },
  Tugas:        { pk: 'id_tugas',      cols: ['id_tugas', 'id_pengampuan', 'judul', 'deskripsi', 'tanggal_beri', 'tenggat', 'id_penilaian'] },
  PengumpulanTugas: { pk: 'id_kumpul', cols: ['id_kumpul', 'id_tugas', 'id_siswa', 'tanggal_kumpul', 'catatan'] },
  ImportLog:    { pk: 'id_import',     cols: ['id_import', 'tanggal', 'jenis_data', 'nama_file', 'jumlah_baru', 'jumlah_diperbarui', 'jumlah_gagal', 'status'] }
};

var SESSION_DAYS = 90;
var MAX_FAILS = 5;
var LOCK_MINUTES = 15;
var MAX_PUSH_ROWS = 300;
var PULL_LIMIT = 1000;
var MAX_CELL_CHARS = 5000;

/* ---------- Pemasangan ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Guru Mapel')
    .addItem('Siapkan Spreadsheet', 'setup')
    .addItem('Buat PIN baru', 'resetPin')
    .addToUi();
}

/** Aman dijalankan ulang: hanya menambah yang belum ada dan tidak mengubah PIN. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari menu Ekstensi di Spreadsheet, lalu jalankan lagi.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('spreadsheet_id', ss.getId());
  Object.keys(SCHEMA).forEach(function (name) { ensureSheet_(ss, name); });
  var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  if (!props.getProperty('rev')) props.setProperty('rev', '0');
  if (!props.getProperty('pin_hash')) {
    var pin = randomPin_();
    savePin_(pin);
    announcePin_(pin);
  } else {
    notify_('Spreadsheet sudah siap. PIN tidak berubah.');
  }
}

/** Dipakai jika PIN lupa. Semua perangkat harus login ulang. */
function resetPin() {
  var pin = randomPin_();
  savePin_(pin);
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('sessions');
  props.deleteProperty('fail_count');
  props.deleteProperty('lock_until');
  announcePin_(pin);
}

function ensureSheet_(ss, name) {
  var wanted = columns_(name);
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  var missing = wanted.filter(function (c) { return current.indexOf(c) < 0; });
  if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  var total = current.length + missing.length;
  sheet.getRange(1, 1, 1, total).setFontWeight('bold');
  sheet.setFrozenRows(1);
  // Semua kolom teks agar nol di depan NIS/NISN dan jam tidak diubah Sheets.
  sheet.getRange(1, 1, sheet.getMaxRows(), total).setNumberFormat('@');
}

function columns_(name) {
  var out = [];
  SCHEMA[name].cols.concat(META_COLS).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
  return out;
}

function randomPin_() {
  var pin;
  do {
    var hex = Utilities.getUuid().replace(/-/g, '');
    pin = String(parseInt(hex.slice(0, 8), 16) % 1000000);
    while (pin.length < 6) pin = '0' + pin;
  } while (!pinIsValid_(pin));
  return pin;
}

function pinIsValid_(pin) {
  return /^\d{6}$/.test(pin) && !/^(\d)\1{5}$/.test(pin) && pin !== '123456' && pin !== '654321';
}

function announcePin_(pin) {
  var msg = 'PIN Anda: ' + pin + '\nCatat PIN ini, lalu ganti di menu Pengaturan aplikasi.';
  Logger.log(msg);
  notify_(msg);
}

function notify_(msg) {
  try { SpreadsheetApp.getUi().alert('Guru Mapel', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
}

/* ---------- Pintu masuk web app ---------- */

function doGet() {
  return json_({ ok: true, app: 'guru-mapel', version: APP_VERSION });
}

function doPost(e) {
  var res;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = route_(body);
  } catch (err) {
    res = failure_(err);
  }
  return json_(res);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function failure_(err) {
  if (err && err.code) return { ok: false, code: err.code, error: err.message };
  Logger.log(err && err.stack ? err.stack : err);
  return { ok: false, code: 'SERVER', error: 'Server gagal memproses permintaan. Coba lagi.' };
}

function appError_(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function route_(body) {
  switch (body.action) {
    case 'ping': return { ok: true, app: 'guru-mapel', version: APP_VERSION };
    case 'login': return withLock_(function () { return login_(String(body.pin || ''), String(body.device_id || '')); });
    case 'push': requireSession_(body.token); return withLock_(function () { return push_(body.rows); });
    case 'pull': requireSession_(body.token); return withLock_(function () { return pull_(Number(body.since) || 0); });
    case 'changePin': requireSession_(body.token); return withLock_(function () { return changePin_(body); });
    case 'logout': return withLock_(function () { return logout_(body.token); });
    default: throw appError_('BAD_REQUEST', 'Permintaan tidak dikenal.');
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw appError_('BUSY', 'Server sedang sibuk. Coba lagi sebentar.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Login ---------- */

function hexDigest_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}

function hashPin_(pin, salt) {
  var value = salt + ':' + pin;
  for (var i = 0; i < 1000; i++) value = hexDigest_(salt + value);
  return value;
}

function savePin_(pin) {
  var salt = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('pin_salt', salt);
  props.setProperty('pin_hash', hashPin_(pin, salt));
}

function checkPin_(pin) {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('pin_hash');
  if (!hash) throw appError_('NOT_SETUP', 'Spreadsheet belum disiapkan. Jalankan setup() dulu.');
  var until = Number(props.getProperty('lock_until') || 0);
  if (until > Date.now()) {
    throw appError_('LOCKED', 'Terlalu banyak PIN salah. Coba lagi dalam ' + Math.ceil((until - Date.now()) / 60000) + ' menit.');
  }
  if (hashPin_(pin, props.getProperty('pin_salt')) === hash) {
    props.deleteProperty('fail_count');
    props.deleteProperty('lock_until');
    return true;
  }
  var fails = Number(props.getProperty('fail_count') || 0) + 1;
  if (fails >= MAX_FAILS) {
    props.setProperty('lock_until', String(Date.now() + LOCK_MINUTES * 60000));
    props.deleteProperty('fail_count');
  } else {
    props.setProperty('fail_count', String(fails));
  }
  return false;
}

function sessions_() {
  var now = Date.now();
  var raw = PropertiesService.getScriptProperties().getProperty('sessions');
  return (raw ? JSON.parse(raw) : []).filter(function (s) { return s.exp > now; });
}

function saveSessions_(list) {
  PropertiesService.getScriptProperties().setProperty('sessions', JSON.stringify(list.slice(-10)));
}

function newToken_() {
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  var list = sessions_();
  list.push({ h: hexDigest_(token), exp: Date.now() + SESSION_DAYS * 86400000 });
  saveSessions_(list);
  return token;
}

function requireSession_(token) {
  if (!token || typeof token !== 'string') throw appError_('AUTH', 'Sesi berakhir. Masukkan PIN lagi.');
  var hash = hexDigest_(token);
  var found = sessions_().some(function (s) { return s.h === hash; });
  if (!found) throw appError_('AUTH', 'Sesi berakhir. Masukkan PIN lagi.');
}

function login_(pin) {
  if (!checkPin_(pin)) throw appError_('BAD_PIN', 'PIN salah.');
  return { ok: true, token: newToken_(), version: APP_VERSION };
}

function logout_(token) {
  if (token) {
    var hash = hexDigest_(String(token));
    saveSessions_(sessions_().filter(function (s) { return s.h !== hash; }));
  }
  return { ok: true };
}

function changePin_(body) {
  var next = String(body.new_pin || '');
  if (!pinIsValid_(next)) throw appError_('WEAK_PIN', 'PIN harus 6 angka dan tidak boleh terlalu mudah ditebak.');
  if (!checkPin_(String(body.old_pin || ''))) throw appError_('BAD_PIN', 'PIN lama salah.');
  savePin_(next);
  // Sesi perangkat lain dicabut; perangkat ini menerima token baru.
  saveSessions_([]);
  return { ok: true, token: newToken_() };
}

/* ---------- Sinkronisasi ---------- */

function book_() {
  var id = PropertiesService.getScriptProperties().getProperty('spreadsheet_id');
  if (!id) throw appError_('NOT_SETUP', 'Spreadsheet belum disiapkan. Jalankan setup() dulu.');
  return SpreadsheetApp.openById(id);
}

function readSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  // Sheet yang belum ada dibuat otomatis agar pembaruan tidak perlu setup() ulang.
  if (!sheet) { ensureSheet_(ss, name); sheet = ss.getSheetByName(name); }
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  return { sheet: sheet, headers: headers, values: values };
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

function rowObject_(headers, values) {
  var out = {};
  headers.forEach(function (h, i) { if (h) out[h] = cellText_(values[i]); });
  return out;
}

/** Tanda kutip tunggal membuat Sheets menyimpan isi sebagai teks, sehingga
 *  nilai seperti =IMPORTXML(...) atau 0012345 tidak pernah ditafsirkan. */
function safeCell_(v) {
  return v === '' ? '' : "'" + v;
}

function cleanRow_(table, row) {
  if (!row || typeof row !== 'object') throw appError_('BAD_ROW', 'Baris tidak valid.');
  var def = SCHEMA[table];
  var id = String(row[def.pk] || '');
  if (!id || id.length > 80) throw appError_('BAD_ROW', 'ID baris tidak valid.');
  var clean = {};
  columns_(table).forEach(function (c) {
    if (c === '_rev') return;
    var v = row[c] === null || row[c] === undefined ? '' : String(row[c]);
    if (v.length > MAX_CELL_CHARS) throw appError_('BAD_ROW', 'Isi kolom ' + c + ' terlalu panjang.');
    clean[c] = v;
  });
  clean[def.pk] = id;
  clean.deleted = clean.deleted === '1' ? '1' : '0';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(clean.updated_at)) throw appError_('BAD_ROW', 'Waktu perubahan tidak valid.');
  return clean;
}

function push_(rows) {
  if (!Array.isArray(rows)) throw appError_('BAD_REQUEST', 'Data tidak valid.');
  if (rows.length > MAX_PUSH_ROWS) throw appError_('BAD_REQUEST', 'Terlalu banyak baris dalam satu kiriman.');

  var ss = book_();
  var props = PropertiesService.getScriptProperties();
  var results = [];
  var byTable = {};

  rows.forEach(function (item, index) {
    var table = item && item.table;
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, table)) {
      results[index] = { status: 'failed', error: 'Tabel tidak dikenal.' };
      return;
    }
    (byTable[table] = byTable[table] || []).push({ index: index, row: item.row });
  });

  // Nomor revisi dipesan lebih dulu agar tidak pernah terpakai dua kali.
  var rev = Number(props.getProperty('rev') || 0);
  props.setProperty('rev', String(rev + rows.length));

  Object.keys(byTable).forEach(function (table) {
    var data = readSheet_(ss, table);
    // Sheet lama otomatis mendapat kolom baru agar tidak ada isian yang terbuang.
    if (columns_(table).some(function (c) { return data.headers.indexOf(c) < 0; })) {
      ensureSheet_(ss, table);
      data = readSheet_(ss, table);
    }
    var pkCol = data.headers.indexOf(SCHEMA[table].pk);
    var updatedCol = data.headers.indexOf('updated_at');
    var positions = {};
    data.values.forEach(function (v, i) { positions[cellText_(v[pkCol])] = i; });

    var appended = [];
    var touchedMin = Infinity;
    var touchedMax = -1;

    byTable[table].forEach(function (item) {
      try {
        var clean = cleanRow_(table, item.row);
        var id = clean[SCHEMA[table].pk];
        var pos = positions[id];
        if (pos !== undefined && pos < data.values.length) {
          var existing = cellText_(data.values[pos][updatedCol]);
          if (existing > clean.updated_at) { results[item.index] = { status: 'stale' }; return; }
          if (existing === clean.updated_at) { results[item.index] = { status: 'ok' }; return; }
        }
        clean._rev = String(++rev);
        var line = data.headers.map(function (h) { return clean[h] === undefined ? '' : clean[h]; });
        if (pos === undefined) {
          positions[id] = data.values.length + appended.length;
          appended.push(line);
        } else if (pos >= data.values.length) {
          appended[pos - data.values.length] = line;
        } else {
          data.values[pos] = line;
          touchedMin = Math.min(touchedMin, pos);
          touchedMax = Math.max(touchedMax, pos);
        }
        results[item.index] = { status: 'ok' };
      } catch (err) {
        results[item.index] = { status: 'failed', error: err.code ? err.message : 'Baris gagal disimpan.' };
      }
    });

    if (touchedMax >= 0) {
      var block = data.values.slice(touchedMin, touchedMax + 1).map(function (line) {
        return line.map(function (v) { return safeCell_(cellText_(v)); });
      });
      data.sheet.getRange(touchedMin + 2, 1, block.length, data.headers.length).setValues(block);
    }
    if (appended.length) {
      var start = data.values.length + 2;
      var needed = start + appended.length - 1 - data.sheet.getMaxRows();
      if (needed > 0) data.sheet.insertRowsAfter(data.sheet.getMaxRows(), needed + 200);
      var range = data.sheet.getRange(start, 1, appended.length, data.headers.length);
      range.setNumberFormat('@');
      range.setValues(appended.map(function (line) { return line.map(safeCell_); }));
    }
  });

  SpreadsheetApp.flush();
  return { ok: true, results: results };
}

function pull_(since) {
  var ss = book_();
  var found = [];
  Object.keys(SCHEMA).forEach(function (table) {
    var data = readSheet_(ss, table);
    var revCol = data.headers.indexOf('_rev');
    data.values.forEach(function (values) {
      var rev = Number(values[revCol]);
      if (rev > since) found.push({ table: table, rev: rev, row: rowObject_(data.headers, values) });
    });
  });
  found.sort(function (a, b) { return a.rev - b.rev; });
  var page = found.slice(0, PULL_LIMIT);
  return {
    ok: true,
    rows: page.map(function (f) { return { table: f.table, row: f.row }; }),
    next: page.length ? page[page.length - 1].rev : since,
    hasMore: found.length > page.length
  };
}
