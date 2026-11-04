/* Import Excel/CSV. Modul ini murni logika agar bisa diuji tanpa browser.
   Setiap baris dianalisis terhadap salinan kerja data, sehingga baris pada sheet
   berikutnya bisa merujuk data baru dari sheet sebelumnya. */
(function (root) {
  const { TABLES, HARI } = root.GM.Schema;
  const MAX_SIZE = 10 * 1024 * 1024;

  const KINDS = {
    tahun: { label: 'Tahun Ajaran', sheet: 'TahunAjaran', table: 'TahunAjaran', cols: [
      { key: 'tahun', label: 'tahun', req: true, ex: '2026/2027', aliases: ['tahun_ajaran', 'tahun_pelajaran', 'tapel'] },
      { key: 'semester', label: 'semester', req: true, ex: 'Ganjil' },
      { key: 'aktif', label: 'aktif', ex: 'Ya', note: 'Ya atau Tidak' },
    ] },
    mapel: { label: 'Mapel', sheet: 'Mapel', table: 'Mapel', cols: [
      { key: 'kode', label: 'kode', ex: 'MTK', aliases: ['kode_mapel'] },
      { key: 'nama_mapel', label: 'nama_mapel', req: true, ex: 'Matematika', aliases: ['mapel', 'mata_pelajaran', 'nama'] },
    ] },
    kelas: { label: 'Kelas', sheet: 'Kelas', table: 'Kelas', cols: [
      { key: 'nama_kelas', label: 'nama_kelas', req: true, ex: 'VII-A', aliases: ['kelas', 'rombel', 'rombongan_belajar'] },
      { key: 'tingkat', label: 'tingkat', ex: 'VII', note: 'Kosongkan jika bisa dibaca dari nama kelas' },
    ] },
    siswa: { label: 'Siswa', sheet: 'Siswa', table: 'Siswa', cols: [
      { key: 'nisn', label: 'nisn', ex: '0112345678', text: true, note: '10 angka, format kolom Teks' },
      { key: 'nis', label: 'nis', ex: '2601', text: true, aliases: ['no_induk', 'nomor_induk', 'nipd'] },
      { key: 'nama', label: 'nama', req: true, ex: 'Nama Siswa', aliases: ['nama_siswa', 'nama_lengkap', 'nama_peserta_didik', 'nama_peserta_didik_'] },
      { key: 'jk', label: 'jk', req: true, ex: 'L', note: 'L atau P', aliases: ['l/p', 'jenis_kelamin', 'gender', 'l_p'] },
      { key: 'kelas', label: 'kelas', req: true, ex: 'VII-A', aliases: ['nama_kelas', 'rombel', 'rombongan_belajar'] },
      { key: 'status', label: 'status', ex: 'Aktif', note: 'Aktif, Pindah, Lulus, atau Keluar' },
    ] },
    pengampuan: { label: 'Pengampuan', sheet: 'Pengampuan', table: 'Pengampuan', cols: [
      { key: 'mapel', label: 'mapel', req: true, ex: 'Matematika', aliases: ['nama_mapel', 'mata_pelajaran'] },
      { key: 'kelas', label: 'kelas', req: true, ex: 'VII-A', aliases: ['nama_kelas', 'rombel'] },
      { key: 'tahun', label: 'tahun', ex: '2026/2027', note: 'Kosongkan untuk tahun aktif', aliases: ['tahun_ajaran'] },
      { key: 'semester', label: 'semester', ex: 'Ganjil', note: 'Kosongkan untuk semester aktif' },
      { key: 'kktp', label: 'kktp', ex: '75', aliases: ['kkm'] },
      { key: 'bobot_formatif', label: 'bobot_formatif', ex: '40' },
      { key: 'bobot_sumatif', label: 'bobot_sumatif', ex: '60' },
    ] },
    jadwal: { label: 'Jadwal', sheet: 'Jadwal', table: 'Jadwal', cols: [
      { key: 'mapel', label: 'mapel', req: true, ex: 'Matematika', aliases: ['nama_mapel', 'mata_pelajaran'] },
      { key: 'kelas', label: 'kelas', req: true, ex: 'VII-A', aliases: ['nama_kelas', 'rombel'] },
      { key: 'hari', label: 'hari', req: true, ex: 'Senin' },
      { key: 'jam_mulai', label: 'jam_mulai', req: true, ex: '07:30', text: true, aliases: ['mulai'] },
      { key: 'jam_selesai', label: 'jam_selesai', req: true, ex: '09:00', text: true, aliases: ['selesai'] },
      { key: 'jam_ke', label: 'jam_ke', ex: '1-2', text: true },
    ] },
  };
  KINDS.nilai = { label: 'Nilai', sheet: 'Nilai', table: 'Nilai', cols: [
    { key: 'nisn', label: 'nisn', ex: '0112345678', text: true },
    { key: 'nis', label: 'nis', ex: '2601', text: true, aliases: ['no_induk', 'nomor_induk'] },
    { key: 'nama', label: 'nama', req: true, ex: 'Nama Siswa', aliases: ['nama_siswa', 'nama_lengkap'] },
    { key: 'nilai', label: 'nilai', req: true, ex: '85', aliases: ['skor'] },
    { key: 'remedial', label: 'remedial', ex: '75' },
    { key: 'catatan', label: 'catatan', ex: '' },
  ] };
  KINDS.tp = { label: 'TP/ATP', sheet: 'TP', table: 'TP', cols: [
    { key: 'mapel', label: 'mapel', req: true, ex: 'Matematika', aliases: ['nama_mapel', 'mata_pelajaran'] },
    { key: 'tingkat', label: 'tingkat', req: true, ex: 'VII', note: 'Harus sama dengan tingkat pada data Kelas' },
    { key: 'kode_tp', label: 'kode_tp', req: true, ex: 'TP 1.1', text: true, aliases: ['kode', 'kode_tujuan'] },
    { key: 'deskripsi', label: 'deskripsi', req: true, ex: 'Menjelaskan konsep bilangan bulat', aliases: ['tujuan_pembelajaran', 'tp'] },
    { key: 'target_pertemuan', label: 'target_pertemuan', ex: '2', note: 'Kosongkan untuk 1 pertemuan', aliases: ['target', 'jp'] },
    { key: 'tautan_modul', label: 'tautan_modul', ex: 'https://drive.google.com/...', aliases: ['modul', 'link_modul', 'tautan'] },
  ] };
  const ORDER = ['tahun', 'mapel', 'kelas', 'siswa', 'pengampuan', 'jadwal'];

  /* ---------- Bantuan ---------- */
  const text = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const fold = (v) => text(v).toLocaleLowerCase('id-ID');
  const headerKey = (v) => fold(v).replace(/\s+/g, '_').replace(/[().]/g, '');
  const pad = (n) => String(n).padStart(2, '0');

  function normTime(v) {
    if (typeof v === 'number' && v >= 0 && v < 1) {
      const m = Math.round(v * 1440);
      return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    }
    const s = text(v);
    const match = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm)?$/i);
    if (!match) return '';
    let h = Number(match[1]);
    const mi = Number(match[2]);
    const ap = (match[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : '';
  }
  const normHari = (v) => {
    const f = fold(v).replace(/['’`]/g, '');
    return HARI.find((h) => h.toLowerCase() === f) || '';
  };
  const normSemester = (v) => {
    const f = fold(v);
    if (f === 'ganjil' || f === '1') return 'Ganjil';
    if (f === 'genap' || f === '2') return 'Genap';
    return '';
  };
  const normJk = (v) => {
    const f = fold(v).replace(/[-\s]/g, '');
    if (['l', 'lk', 'lakilaki', 'pria'].includes(f)) return 'L';
    if (['p', 'pr', 'perempuan', 'wanita'].includes(f)) return 'P';
    return '';
  };
  const normStatus = (v) => {
    const f = fold(v);
    if (!f) return 'Aktif';
    return ['Aktif', 'Pindah', 'Lulus', 'Keluar'].find((s) => s.toLowerCase() === f) || '';
  };
  const normYes = (v) => {
    const f = fold(v);
    if (['ya', 'y', '1', 'true', 'aktif'].includes(f)) return '1';
    if (['', 'tidak', 't', '0', 'false', 'tidak aktif'].includes(f)) return '0';
    return '';
  };
  const guessTingkat = (nama) => {
    const m = text(nama).match(/^([IVX]+|\d{1,2})(?=[\s\-./]|$)/i);
    return m ? m[1].toUpperCase() : '';
  };
  const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

  function newUuid() {
    return root.GM.Store ? root.GM.Store.uuid() : `id-${Math.random().toString(36).slice(2)}${Date.now()}`;
  }

  const activeYear = (work) => work.TahunAjaran.find((t) => t.aktif === '1') || null;
  const yearLabel = (t) => `${t.tahun} ${t.semester}`;

  /** Mencari jadwal lain yang waktunya bertabrakan pada tahun yang sama. */
  function findClash(work, candidate, yearId, ignoreId) {
    const pengampuan = new Map(work.Pengampuan.map((p) => [p.id_pengampuan, p]));
    return work.Jadwal.find((j) => {
      if (j.id_jadwal === ignoreId || j.hari !== candidate.hari) return false;
      const p = pengampuan.get(j.id_pengampuan);
      return p && p.id_tahun === yearId && overlap(candidate.jam_mulai, candidate.jam_selesai, j.jam_mulai, j.jam_selesai);
    }) || null;
  }
  function describeJadwal(work, j) {
    const p = work.Pengampuan.find((x) => x.id_pengampuan === j.id_pengampuan) || {};
    const m = work.Mapel.find((x) => x.id_mapel === p.id_mapel) || {};
    const k = work.Kelas.find((x) => x.id_kelas === p.id_kelas) || {};
    return `${m.nama_mapel || '?'} ${k.nama_kelas || '?'} ${j.jam_mulai}-${j.jam_selesai}`;
  }

  /* ---------- Membaca file ---------- */
  function readBook(XLSX, buffer, fileName) {
    if (buffer.byteLength > MAX_SIZE) throw new Error('Ukuran file melebihi 10 MB.');
    const isCsv = /\.csv$/i.test(fileName || '');
    return XLSX.read(buffer, { type: 'array', raw: isCsv, cellDates: false, dense: false });
  }

  function aliasMap(kind) {
    const map = new Map();
    kind.cols.forEach((c) => {
      map.set(c.key, c.key);
      (c.aliases || []).forEach((a) => map.set(a, c.key));
    });
    return map;
  }

  /** Baris judul boleh berada di bawah kop sekolah; dicari pada 15 baris pertama. */
  function readSheet(XLSX, ws, kind) {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const map = aliasMap(kind);
    let headerRow = -1;
    let best = 0;
    aoa.slice(0, 15).forEach((row, i) => {
      const hits = new Set(row.map((c) => map.get(headerKey(c))).filter(Boolean));
      const req = kind.cols.filter((c) => c.req && hits.has(c.key)).length;
      const score = req * 10 + hits.size;
      if (score > best) { best = score; headerRow = i; }
    });
    const missingAll = kind.cols.filter((c) => c.req).map((c) => c.label);
    if (headerRow < 0) return { rows: [], missing: missingAll };
    const positions = {};
    aoa[headerRow].forEach((c, i) => {
      const k = map.get(headerKey(c));
      if (k && positions[k] === undefined) positions[k] = i;
    });
    const missing = kind.cols.filter((c) => c.req && positions[c.key] === undefined).map((c) => c.label);
    const rows = [];
    aoa.slice(headerRow + 1).forEach((row, i) => {
      if (!row.some((c) => text(c) !== '')) return;
      const data = {};
      kind.cols.forEach((c) => {
        const raw = positions[c.key] === undefined ? '' : row[positions[c.key]];
        data[c.key] = raw;
      });
      rows.push({ no: headerRow + i + 2, data });
    });
    return { rows, missing };
  }

  /** Mengubah file menjadi daftar bagian yang akan dianalisis. */
  function readParts(XLSX, wb, kindKey) {
    const parts = [];
    if (kindKey === 'lengkap') {
      ORDER.forEach((k) => {
        const name = wb.SheetNames.find((n) => headerKey(n).replace(/_/g, '') === KINDS[k].sheet.toLowerCase());
        if (name) parts.push({ kind: k, sheetName: name, ...readSheet(XLSX, wb.Sheets[name], KINDS[k]) });
      });
      if (!parts.length) throw new Error('Sheet tidak dikenali. Gunakan file Template Import Lengkap.');
      return parts;
    }
    const kind = KINDS[kindKey];
    const name = wb.SheetNames.find((n) => headerKey(n).replace(/_/g, '') === kind.sheet.toLowerCase())
      || wb.SheetNames.find((n) => fold(n) !== 'petunjuk');
    if (!name) throw new Error('File tidak berisi data.');
    parts.push({ kind: kindKey, sheetName: name, ...readSheet(XLSX, wb.Sheets[name], kind) });
    return parts;
  }

  /* ---------- Analisis ---------- */
  function upsert(work, ctx, table, next) {
    const pk = TABLES[table].pk;
    const i = work[table].findIndex((r) => r[pk] === next[pk]);
    if (i >= 0) {
      const before = work[table][i];
      work[table][i] = { ...before, ...next };
      const op = ctx.ops.get(`${table}|${next[pk]}`);
      if (op) op.row = work[table][i];
      else ctx.ops.set(`${table}|${next[pk]}`, { table, row: work[table][i], before });
    } else {
      work[table].push(next);
      ctx.ops.set(`${table}|${next[pk]}`, { table, row: next, before: null });
    }
  }

  function finish(result, row, ctx, status, fields, apply) {
    // status: baru | sama | berubah | masalah | cek
    result.status = status;
    if (fields) result.changes = fields;
    if (status === 'masalah' || status === 'sama') return;
    if (status === 'cek' && !ctx.confirmed.has(`${result.kind}:${row.no}`)) return;
    if (status === 'berubah' && ctx.mode !== 'perbarui') { result.skipped = true; return; }
    apply();
    result.saved = true;
  }

  function diff(before, next, fields) {
    return fields.filter(([k]) => (before[k] || '') !== (next[k] || ''))
      .map(([k, label]) => `${label}: ${before[k] || '(kosong)'} → ${next[k] || '(kosong)'}`);
  }

  const analyzers = {
    tahun(row, res, work, ctx) {
      const tahun = text(row.data.tahun);
      const semester = normSemester(row.data.semester);
      const aktif = normYes(row.data.aktif);
      if (!/^\d{4}\/\d{4}$/.test(tahun)) res.errors.push('Tahun harus seperti 2026/2027.');
      if (!semester) res.errors.push('Semester harus Ganjil atau Genap.');
      if (aktif === '') res.errors.push('Kolom aktif harus Ya atau Tidak.');
      const dupKey = `${tahun}|${semester}`;
      if (ctx.seen.has(dupKey)) res.errors.push(`Sama dengan baris ${ctx.seen.get(dupKey)} di file ini.`);
      if (aktif === '1' && ctx.seen.has('#aktif')) res.errors.push(`Baris ${ctx.seen.get('#aktif')} juga ditandai aktif. Hanya satu yang boleh aktif.`);
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      ctx.seen.set(dupKey, row.no);
      if (aktif === '1') ctx.seen.set('#aktif', row.no);
      const existing = work.TahunAjaran.find((t) => t.tahun === tahun && t.semester === semester);
      const next = { tahun, semester, aktif };
      const activate = (id) => {
        if (aktif !== '1') return;
        work.TahunAjaran.filter((t) => t.aktif === '1' && t.id_tahun !== id).forEach((t) => upsert(work, ctx, 'TahunAjaran', { ...t, aktif: '0' }));
      };
      if (!existing) {
        const id = newUuid();
        return finish(res, row, ctx, 'baru', null, () => { activate(id); upsert(work, ctx, 'TahunAjaran', { id_tahun: id, ...next }); });
      }
      const fields = diff(existing, next, [['aktif', 'Aktif']]);
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => { activate(existing.id_tahun); upsert(work, ctx, 'TahunAjaran', { ...existing, ...next }); });
    },

    mapel(row, res, work, ctx) {
      const nama = text(row.data.nama_mapel);
      const kode = text(row.data.kode);
      if (!nama) res.errors.push('Nama mapel kosong.');
      const k = fold(nama);
      if (nama && ctx.seen.has(k)) res.errors.push(`Sama dengan baris ${ctx.seen.get(k)} di file ini.`);
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      ctx.seen.set(k, row.no);
      const existing = work.Mapel.find((m) => fold(m.nama_mapel) === k);
      const next = { nama_mapel: nama, kode };
      if (!existing) return finish(res, row, ctx, 'baru', null, () => upsert(work, ctx, 'Mapel', { id_mapel: newUuid(), ...next }));
      const fields = diff(existing, next, [['kode', 'Kode'], ['nama_mapel', 'Nama']]);
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => upsert(work, ctx, 'Mapel', { ...existing, ...next }));
    },

    kelas(row, res, work, ctx) {
      const nama = text(row.data.nama_kelas);
      const tingkat = text(row.data.tingkat) || guessTingkat(nama);
      if (!nama) res.errors.push('Nama kelas kosong.');
      if (nama && !tingkat) res.errors.push('Tingkat kosong dan tidak bisa dibaca dari nama kelas.');
      const k = fold(nama);
      if (nama && ctx.seen.has(k)) res.errors.push(`Sama dengan baris ${ctx.seen.get(k)} di file ini.`);
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      ctx.seen.set(k, row.no);
      const existing = work.Kelas.find((c) => fold(c.nama_kelas) === k);
      const next = { nama_kelas: nama, tingkat };
      if (!existing) return finish(res, row, ctx, 'baru', null, () => upsert(work, ctx, 'Kelas', { id_kelas: newUuid(), ...next }));
      const fields = diff(existing, next, [['nama_kelas', 'Nama'], ['tingkat', 'Tingkat']]);
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => upsert(work, ctx, 'Kelas', { ...existing, ...next }));
    },

    siswa(row, res, work, ctx) {
      const nama = text(row.data.nama);
      const nisn = text(row.data.nisn);
      const nis = text(row.data.nis);
      const jk = normJk(row.data.jk);
      const status = normStatus(row.data.status);
      const kelasName = text(row.data.kelas);
      const kelas = work.Kelas.find((c) => fold(c.nama_kelas) === fold(kelasName));
      const year = activeYear(work);
      if (!nama) res.errors.push('Nama kosong.');
      if (nisn && !/^\d{10}$/.test(nisn)) res.errors.push('NISN harus 10 angka. Jika angka nol di depan hilang, format kolom sebagai Teks lalu isi ulang.');
      if (nis && !/^[0-9A-Za-z./-]+$/.test(nis)) res.errors.push('NIS berisi karakter yang tidak dikenali.');
      if (!jk) res.errors.push('Jenis kelamin harus L atau P.');
      if (!status) res.errors.push('Status harus Aktif, Pindah, Lulus, atau Keluar.');
      if (!kelasName) res.errors.push('Kelas kosong.');
      else if (!kelas) res.errors.push(`Kelas ${kelasName} belum terdaftar.`);
      if (!year) res.errors.push('Belum ada tahun ajaran aktif.');
      if (nisn && ctx.seen.has(`n:${nisn}`)) res.errors.push(`NISN sama dengan baris ${ctx.seen.get(`n:${nisn}`)} di file ini.`);
      if (nis && ctx.seen.has(`i:${nis}`)) res.errors.push(`NIS sama dengan baris ${ctx.seen.get(`i:${nis}`)} di file ini.`);
      const byNisn = nisn ? work.Siswa.find((s) => s.nisn === nisn) : null;
      const byNis = nis ? work.Siswa.find((s) => s.nis === nis) : null;
      if (byNisn && byNis && byNisn.id_siswa !== byNis.id_siswa) res.errors.push(`NISN milik ${byNisn.nama}, tetapi NIS milik ${byNis.nama}.`);
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      if (nisn) ctx.seen.set(`n:${nisn}`, row.no);
      if (nis) ctx.seen.set(`i:${nis}`, row.no);

      const next = { nama, nisn, nis, jk, status };
      const memberOf = (id) => work.AnggotaKelas.find((a) => a.id_tahun === year.id_tahun && a.id_siswa === id);
      const place = (id) => {
        const m = memberOf(id);
        if (!m) upsert(work, ctx, 'AnggotaKelas', { id_anggota: newUuid(), id_tahun: year.id_tahun, id_kelas: kelas.id_kelas, id_siswa: id });
        else if (m.id_kelas !== kelas.id_kelas) upsert(work, ctx, 'AnggotaKelas', { ...m, id_kelas: kelas.id_kelas });
      };
      const existing = byNisn || byNis;
      if (!existing) {
        const add = () => { const id = newUuid(); upsert(work, ctx, 'Siswa', { id_siswa: id, ...next }); place(id); };
        if (!nisn && !nis) {
          const twin = work.Siswa.find((s) => fold(s.nama) === fold(nama));
          res.warnings.push(twin ? `Tanpa NIS/NISN. Mungkin sama dengan ${twin.nama}.` : 'Tanpa NIS/NISN. Periksa agar tidak dobel.');
          return finish(res, row, ctx, 'cek', null, add);
        }
        return finish(res, row, ctx, 'baru', null, add);
      }
      const merged = { ...next, nisn: nisn || existing.nisn, nis: nis || existing.nis };
      const fields = diff(existing, merged, [['nama', 'Nama'], ['nisn', 'NISN'], ['nis', 'NIS'], ['jk', 'JK'], ['status', 'Status']]);
      const m = memberOf(existing.id_siswa);
      if (!m || m.id_kelas !== kelas.id_kelas) {
        const old = m ? (work.Kelas.find((c) => c.id_kelas === m.id_kelas) || {}).nama_kelas : '(belum ada)';
        fields.push(`Kelas: ${old} → ${kelas.nama_kelas}`);
      }
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => { upsert(work, ctx, 'Siswa', { ...existing, ...merged }); place(existing.id_siswa); });
    },

    pengampuan(row, res, work, ctx) {
      const mapel = work.Mapel.find((m) => fold(m.nama_mapel) === fold(row.data.mapel) || (text(m.kode) && fold(m.kode) === fold(row.data.mapel)));
      const kelas = work.Kelas.find((c) => fold(c.nama_kelas) === fold(row.data.kelas));
      if (!text(row.data.mapel)) res.errors.push('Mapel kosong.');
      else if (!mapel) res.errors.push(`Mapel ${text(row.data.mapel)} belum terdaftar.`);
      if (!text(row.data.kelas)) res.errors.push('Kelas kosong.');
      else if (!kelas) res.errors.push(`Kelas ${text(row.data.kelas)} belum terdaftar.`);
      let year = activeYear(work);
      const tahunText = text(row.data.tahun);
      const sem = normSemester(row.data.semester);
      if (tahunText || text(row.data.semester)) {
        year = work.TahunAjaran.find((t) => t.tahun === tahunText && t.semester === sem) || null;
        if (!year) res.errors.push(`Tahun ajaran ${tahunText} ${text(row.data.semester)} belum terdaftar.`);
      } else if (!year) res.errors.push('Belum ada tahun ajaran aktif.');

      const setting = (k, d) => { const r = work.Pengaturan.find((x) => x.key === k); return r && r.value !== '' ? r.value : d; };
      const number = (v, d) => (text(v) === '' ? d : text(v).replace(',', '.'));
      const kktp = number(row.data.kktp, setting('default_kktp', '75'));
      const bf = number(row.data.bobot_formatif, setting('default_bobot_formatif', '40'));
      const bs = number(row.data.bobot_sumatif, setting('default_bobot_sumatif', '60'));
      [['KKTP', kktp], ['Bobot formatif', bf], ['Bobot sumatif', bs]].forEach(([l, v]) => {
        if (!(Number(v) >= 0 && Number(v) <= 100)) res.errors.push(`${l} harus angka 0 sampai 100.`);
      });
      if (Number(bf) + Number(bs) !== 100) res.errors.push('Bobot formatif dan sumatif harus berjumlah 100.');
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      const k = `${year.id_tahun}|${mapel.id_mapel}|${kelas.id_kelas}`;
      if (ctx.seen.has(k)) { res.errors.push(`Sama dengan baris ${ctx.seen.get(k)} di file ini.`); return finish(res, row, ctx, 'masalah'); }
      ctx.seen.set(k, row.no);
      const next = { id_tahun: year.id_tahun, id_mapel: mapel.id_mapel, id_kelas: kelas.id_kelas, kktp, bobot_formatif: bf, bobot_sumatif: bs };
      const existing = work.Pengampuan.find((p) => p.id_tahun === year.id_tahun && p.id_mapel === mapel.id_mapel && p.id_kelas === kelas.id_kelas);
      if (!existing) return finish(res, row, ctx, 'baru', null, () => upsert(work, ctx, 'Pengampuan', { id_pengampuan: newUuid(), ...next }));
      const fields = diff(existing, next, [['kktp', 'KKTP'], ['bobot_formatif', 'Bobot formatif'], ['bobot_sumatif', 'Bobot sumatif']]);
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => upsert(work, ctx, 'Pengampuan', { ...existing, ...next }));
    },

    jadwal(row, res, work, ctx) {
      const year = activeYear(work);
      const mapel = work.Mapel.find((m) => fold(m.nama_mapel) === fold(row.data.mapel) || (text(m.kode) && fold(m.kode) === fold(row.data.mapel)));
      const kelas = work.Kelas.find((c) => fold(c.nama_kelas) === fold(row.data.kelas));
      const hari = normHari(row.data.hari);
      const mulai = normTime(row.data.jam_mulai);
      const selesai = normTime(row.data.jam_selesai);
      const jamKe = text(row.data.jam_ke);
      if (!year) res.errors.push('Belum ada tahun ajaran aktif.');
      if (!mapel) res.errors.push(`Mapel ${text(row.data.mapel) || '(kosong)'} belum terdaftar.`);
      if (!kelas) res.errors.push(`Kelas ${text(row.data.kelas) || '(kosong)'} belum terdaftar.`);
      if (!hari) res.errors.push('Hari tidak dikenali.');
      if (!mulai || !selesai) res.errors.push('Jam harus seperti 07:30.');
      else if (mulai >= selesai) res.errors.push('Jam selesai harus setelah jam mulai.');
      const p = year && mapel && kelas ? work.Pengampuan.find((x) => x.id_tahun === year.id_tahun && x.id_mapel === mapel.id_mapel && x.id_kelas === kelas.id_kelas) : null;
      if (year && mapel && kelas && !p) res.errors.push(`Pengampuan ${mapel.nama_mapel} ${kelas.nama_kelas} belum terdaftar.`);
      if (res.errors.length) return finish(res, row, ctx, 'masalah');
      const next = { id_pengampuan: p.id_pengampuan, hari, jam_mulai: mulai, jam_selesai: selesai, jam_ke: jamKe };
      const existing = work.Jadwal.find((j) => j.id_pengampuan === p.id_pengampuan && j.hari === hari && j.jam_mulai === mulai);
      const clash = findClash(work, next, year.id_tahun, existing ? existing.id_jadwal : null);
      if (clash) { res.errors.push(`Bentrok dengan ${describeJadwal(work, clash)} pada hari ${hari}.`); return finish(res, row, ctx, 'masalah'); }
      if (!existing) return finish(res, row, ctx, 'baru', null, () => upsert(work, ctx, 'Jadwal', { id_jadwal: newUuid(), ...next }));
      const fields = diff(existing, next, [['jam_selesai', 'Jam selesai'], ['jam_ke', 'Jam ke']]);
      if (!fields.length) return finish(res, row, ctx, 'sama');
      return finish(res, row, ctx, 'berubah', fields, () => upsert(work, ctx, 'Jadwal', { ...existing, ...next }));
    },
  };

  analyzers.nilai = function nilai(row, res, work, ctx) {
    const { penilaian, ampu } = ctx.extra;
    const T = root.GM.Teaching;
    const students = T.roster(work, ampu, '');
    const nisn = text(row.data.nisn);
    const nis = text(row.data.nis);
    const name = text(row.data.nama);
    const sameName = students.filter((s) => fold(s.nama) === fold(name));
    let siswa = (nisn && students.find((s) => s.nisn === nisn)) || (nis && students.find((s) => s.nis === nis)) || null;
    if (!siswa && !nisn && !nis && sameName.length === 1) [siswa] = sameName;
    if (!siswa) res.errors.push(sameName.length > 1 ? `Ada dua siswa bernama ${name}. Isi NISN atau NIS.` : `Siswa ${name || '(kosong)'} tidak ada di kelas ini.`);
    if (siswa && ctx.seen.has(siswa.id_siswa)) res.errors.push(`Siswa sama dengan baris ${ctx.seen.get(siswa.id_siswa)} di file ini.`);
    const blank = text(row.data.nilai) === '' && text(row.data.remedial) === '' && text(row.data.catatan) === '';
    if (blank && siswa) { res.warnings.push('Nilai kosong, baris dilewati.'); return finish(res, row, ctx, 'sama'); }
    const entry = { id_siswa: siswa ? siswa.id_siswa : '', nilai: row.data.nilai, remedial: row.data.remedial, catatan: text(row.data.catatan) };
    const invalid = T.validateEntry(entry, penilaian);
    if (invalid) res.errors.push(invalid);
    if (res.errors.length) return finish(res, row, ctx, 'masalah');
    ctx.seen.set(siswa.id_siswa, row.no);
    const changes = T.saveNilai(work, penilaian, [entry]);
    const old = work.Nilai.find((n) => n.id_penilaian === penilaian.id_penilaian && n.id_siswa === siswa.id_siswa);
    if (!changes.length) return finish(res, row, ctx, 'sama');
    const apply = () => upsert(work, ctx, 'Nilai', changes[0].row);
    if (!old) return finish(res, row, ctx, 'baru', null, apply);
    return finish(res, row, ctx, 'berubah', diff(old, changes[0].row, [['nilai', 'Nilai'], ['remedial', 'Remedial'], ['catatan', 'Catatan']]), apply);
  };

  analyzers.tp = function tp(row, res, work, ctx) {
    const mapel = work.Mapel.find((m) => fold(m.nama_mapel) === fold(row.data.mapel) || (text(m.kode) && fold(m.kode) === fold(row.data.mapel)));
    const level = work.Kelas.find((k) => fold(k.tingkat) === fold(row.data.tingkat));
    const kode = text(row.data.kode_tp);
    const deskripsi = text(row.data.deskripsi);
    const targetText = text(row.data.target_pertemuan) || '1';
    const link = text(row.data.tautan_modul);
    if (!mapel) res.errors.push(`Mapel ${text(row.data.mapel) || '(kosong)'} belum terdaftar.`);
    if (!level) res.errors.push(`Tingkat ${text(row.data.tingkat) || '(kosong)'} tidak ada pada data Kelas.`);
    if (!kode) res.errors.push('Kode TP kosong.');
    if (!deskripsi) res.errors.push('Deskripsi kosong.');
    if (!/^[1-9]\d*$/.test(targetText)) res.errors.push('Target pertemuan harus angka bulat mulai dari 1.');
    if (link && !/^https?:\/\/\S+$/i.test(link)) res.errors.push('Tautan modul harus diawali https://');
    const key = `${mapel ? mapel.id_mapel : ''}|${fold(row.data.tingkat)}|${fold(kode)}`;
    if (kode && ctx.seen.has(key)) res.errors.push(`Sama dengan baris ${ctx.seen.get(key)} di file ini.`);
    if (res.errors.length) return finish(res, row, ctx, 'masalah');
    ctx.seen.set(key, row.no);
    const same = work.TP.filter((t) => t.id_mapel === mapel.id_mapel && fold(t.tingkat) === fold(level.tingkat));
    const existing = same.find((t) => fold(t.kode_tp) === fold(kode));
    const next = { id_mapel: mapel.id_mapel, tingkat: level.tingkat, kode_tp: kode, deskripsi, target_pertemuan: targetText, tautan_modul: link };
    if (!existing) return finish(res, row, ctx, 'baru', null, () => upsert(work, ctx, 'TP', { id_tp: newUuid(), urutan: String(Math.max(0, ...same.map((t) => Number(t.urutan) || 0)) + 1), ...next }));
    const fields = diff(existing, next, [['deskripsi', 'Deskripsi'], ['target_pertemuan', 'Target'], ['tautan_modul', 'Tautan']]);
    if (!fields.length) return finish(res, row, ctx, 'sama');
    return finish(res, row, ctx, 'berubah', fields, () => upsert(work, ctx, 'TP', { ...existing, ...next }));
  };

  /** parts dari readParts, db dari Store.snapshotDb. Tidak mengubah db asli. */
  function analyze(parts, db, opts = {}) {
    const work = {};
    Object.keys(TABLES).forEach((t) => { work[t] = (db[t] || []).map((r) => ({ ...r })); });
    const ops = new Map();
    const confirmed = opts.confirmed || new Set();
    const mode = opts.mode || 'lewati';
    const out = parts.map((part) => {
      const ctx = { ops, confirmed, mode, seen: new Map(), extra: opts.extra };
      const rows = part.missing.length ? [] : part.rows.map((row) => {
        const res = { kind: part.kind, no: row.no, data: row.data, errors: [], warnings: [], changes: [], status: 'baru' };
        analyzers[part.kind](row, res, work, ctx);
        return res;
      });
      return { ...part, rows, counts: countRows(rows) };
    });
    const total = out.reduce((acc, p) => {
      Object.keys(acc).forEach((k) => { acc[k] += p.counts[k]; });
      return acc;
    }, emptyCounts());
    return { parts: out, ops: [...ops.values()], counts: total };
  }

  function emptyCounts() { return { baru: 0, sama: 0, berubah: 0, cek: 0, masalah: 0, disimpan: 0 }; }
  function countRows(rows) {
    const c = emptyCounts();
    rows.forEach((r) => { c[r.status] += 1; if (r.saved) c.disimpan += 1; });
    return c;
  }

  /* ---------- Membuat file ---------- */
  function addTemplateSheet(XLSX, wb, kind) {
    const header = kind.cols.map((c) => c.label);
    const ws = XLSX.utils.aoa_to_sheet([header]);
    ws['!cols'] = kind.cols.map((c) => ({ wch: Math.max(c.label.length + 3, 14) }));
    kind.cols.forEach((c, col) => {
      if (!c.text) return;
      for (let r = 1; r <= 1000; r += 1) ws[XLSX.utils.encode_cell({ r, c: col })] = { t: 's', v: '', z: '@' };
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: header.length - 1 } });
    XLSX.utils.book_append_sheet(wb, ws, kind.sheet);
  }

  function template(XLSX, kindKey) {
    const wb = XLSX.utils.book_new();
    const kinds = kindKey === 'lengkap' ? ORDER : [kindKey];
    const notes = [['Sheet', 'Kolom', 'Wajib', 'Contoh isi', 'Keterangan']];
    kinds.forEach((k) => KINDS[k].cols.forEach((c) => notes.push([KINDS[k].sheet, c.label, c.req ? 'Ya' : 'Tidak', c.ex, c.note || ''])));
    const info = XLSX.utils.aoa_to_sheet(notes);
    info['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
    kinds.forEach((k) => addTemplateSheet(XLSX, wb, KINDS[k]));
    return wb;
  }

  function problemBook(XLSX, analysis) {
    const rows = [['Sheet', 'Baris di file', 'Data', 'Alasan']];
    analysis.parts.forEach((p) => p.rows.filter((r) => r.status === 'masalah' || (r.status === 'cek' && !r.saved)).forEach((r) => {
      rows.push([KINDS[p.kind].label, r.no, Object.values(r.data).map(text).filter(Boolean).join(' | '), [...r.errors, ...r.warnings].join(' ')]);
    }));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 50 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Baris bermasalah');
    return wb;
  }

  root.GM.Importer = {
    KINDS, ORDER, MAX_SIZE, readBook, readParts, analyze, template, problemBook,
    normTime, normHari, normSemester, normJk, findClash, describeJadwal, fold, text, guessTingkat, activeYear, yearLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
