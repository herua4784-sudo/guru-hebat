/* Presensi dan Jurnal. Modul ini murni logika agar bisa diuji tanpa browser.
   ID dibuat dari mapel-kelas + tanggal, sehingga dua perangkat yang mengisi
   pertemuan yang sama saat offline tidak menghasilkan data dobel. */
(function (root) {
  const { HARI } = root.GM.Schema;
  const STATUS = ['Hadir', 'Sakit', 'Izin', 'Alpa'];

  function hash(text) {
    const round = (seed) => {
      let a = 0xdeadbeef ^ seed;
      let b = 0x41c6ce57 ^ seed;
      for (let i = 0; i < text.length; i += 1) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 2654435761);
        b = Math.imul(b ^ c, 1597334677);
      }
      a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
      b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
      return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0');
    };
    return round(1) + round(2);
  }
  const pertemuanId = (idPengampuan, tanggal) => `ptm-${hash(`${idPengampuan}|${tanggal}`)}`;
  const presensiId = (idPertemuan, idSiswa) => `prs-${hash(`${idPertemuan}|${idSiswa}`)}`;
  const jurnalId = (idPertemuan) => `jrn-${hash(idPertemuan)}`;

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const hariOf = (tanggal) => HARI[(parseYmd(tanggal).getDay() + 6) % 7];
  const addDays = (tanggal, n) => { const d = parseYmd(tanggal); d.setDate(d.getDate() + n); return ymd(d); };

  /** Siswa aktif di kelas, ditambah siswa nonaktif yang sudah tercatat pada pertemuan ini. */
  function roster(db, ampu, idPertemuan) {
    const members = new Set(db.AnggotaKelas.filter((a) => a.id_tahun === ampu.id_tahun && a.id_kelas === ampu.id_kelas).map((a) => a.id_siswa));
    const recorded = new Set(db.Presensi.filter((p) => p.id_pertemuan === idPertemuan).map((p) => p.id_siswa));
    return db.Siswa.filter((s) => (members.has(s.id_siswa) && s.status === 'Aktif') || recorded.has(s.id_siswa))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }

  function sessions(db, idPengampuan) {
    return db.Pertemuan.filter((p) => p.id_pengampuan === idPengampuan).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }

  function renumber(list) {
    const out = [];
    list.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal)).forEach((p, i) => {
      if (p.pertemuan_ke !== String(i + 1)) out.push({ table: 'Pertemuan', row: { ...p, pertemuan_ke: String(i + 1) } });
    });
    return out;
  }

  /** Mengembalikan pertemuan beserta perubahan yang diperlukan untuk membuatnya. */
  function ensureSession(db, ampu, tanggal) {
    const id = pertemuanId(ampu.id_pengampuan, tanggal);
    const list = sessions(db, ampu.id_pengampuan);
    if (list.some((p) => p.id_pertemuan === id)) return { id, changes: [] };
    const fresh = { id_pertemuan: id, id_pengampuan: ampu.id_pengampuan, tanggal, pertemuan_ke: '', id_tp: '' };
    return { id, changes: renumber([...list, fresh]) };
  }

  function savePresensi(db, ampu, tanggal, entries) {
    const { id, changes } = ensureSession(db, ampu, tanggal);
    const existing = new Map(db.Presensi.filter((p) => p.id_pertemuan === id).map((p) => [p.id_siswa, p]));
    entries.forEach((e) => {
      const old = existing.get(e.id_siswa);
      const keterangan = e.status === 'Hadir' ? '' : String(e.keterangan || '').trim();
      if (old && old.status === e.status && (old.keterangan || '') === keterangan) return;
      changes.push({ table: 'Presensi', row: { ...(old || {}), id_presensi: presensiId(id, e.id_siswa), id_pertemuan: id, id_siswa: e.id_siswa, status: e.status, keterangan } });
    });
    return changes;
  }

  function saveJurnal(db, ampu, tanggal, form) {
    const { id, changes } = ensureSession(db, ampu, tanggal);
    const old = db.Jurnal.find((j) => j.id_pertemuan === id);
    const row = { materi: form.materi.trim(), kegiatan: form.kegiatan.trim(), catatan: form.catatan.trim() };
    changes.push({ table: 'Jurnal', row: { ...(old || {}), id_jurnal: jurnalId(id), id_pertemuan: id, ...row } });
    return changes;
  }

  function deleteSession(db, idPertemuan) {
    const target = db.Pertemuan.find((p) => p.id_pertemuan === idPertemuan);
    if (!target) return [];
    const gone = (table, rows) => rows.map((row) => ({ table, row: { ...row, deleted: '1' } }));
    const rest = sessions(db, target.id_pengampuan).filter((p) => p.id_pertemuan !== idPertemuan);
    return [
      ...gone('Pertemuan', [target]),
      ...gone('Presensi', db.Presensi.filter((p) => p.id_pertemuan === idPertemuan)),
      ...gone('Jurnal', db.Jurnal.filter((j) => j.id_pertemuan === idPertemuan)),
      ...renumber(rest),
    ];
  }

  function sessionStatus(db, idPengampuan, tanggal) {
    const id = pertemuanId(idPengampuan, tanggal);
    return {
      id,
      presensi: db.Presensi.some((p) => p.id_pertemuan === id),
      jurnal: db.Jurnal.some((j) => j.id_pertemuan === id),
      pertemuan: db.Pertemuan.find((p) => p.id_pertemuan === id) || null,
    };
  }

  const absent = (db, idPertemuan) => db.Presensi.filter((p) => p.id_pertemuan === idPertemuan && p.status !== 'Hadir');

  function recap(db, ampu, from, to) {
    const list = sessions(db, ampu.id_pengampuan).filter((p) => (!from || p.tanggal >= from) && (!to || p.tanggal <= to));
    const ids = new Set(list.map((p) => p.id_pertemuan));
    const rows = new Map();
    const siswa = new Map(db.Siswa.map((s) => [s.id_siswa, s]));
    const blank = (s) => ({ id_siswa: s.id_siswa, nama: s.nama, nisn: s.nisn, Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0, total: 0 });
    roster(db, ampu, '').forEach((s) => rows.set(s.id_siswa, blank(s)));
    db.Presensi.filter((p) => ids.has(p.id_pertemuan)).forEach((p) => {
      const s = siswa.get(p.id_siswa);
      if (!s || !STATUS.includes(p.status)) return;
      if (!rows.has(s.id_siswa)) rows.set(s.id_siswa, blank(s));
      const r = rows.get(s.id_siswa);
      r[p.status] += 1;
      r.total += 1;
    });
    const result = [...rows.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
      .map((r) => ({ ...r, persen: r.total ? Math.round((r.Hadir / r.total) * 1000) / 10 : null }));
    const sum = (k) => result.reduce((n, r) => n + r[k], 0);
    const total = sum('total');
    return {
      sessions: list.length, rows: result,
      kelas: { Hadir: sum('Hadir'), Sakit: sum('Sakit'), Izin: sum('Izin'), Alpa: sum('Alpa'), total, persen: total ? Math.round((sum('Hadir') / total) * 1000) / 10 : null },
    };
  }

  /** Jam mengajar beberapa hari terakhir yang presensi atau jurnalnya belum lengkap. */
  function reminders(db, yearId, today, days = 7) {
    const ampu = new Map(db.Pengampuan.filter((p) => p.id_tahun === yearId).map((p) => [p.id_pengampuan, p]));
    const out = [];
    for (let i = 1; i <= days; i += 1) {
      const tanggal = addDays(today, -i);
      const hari = hariOf(tanggal);
      const seen = new Set();
      db.Jadwal.filter((j) => j.hari === hari && ampu.has(j.id_pengampuan)).forEach((j) => {
        if (seen.has(j.id_pengampuan)) return;
        seen.add(j.id_pengampuan);
        const st = sessionStatus(db, j.id_pengampuan, tanggal);
        if (!st.presensi || !st.jurnal) out.push({ tanggal, id_pengampuan: j.id_pengampuan, presensi: st.presensi, jurnal: st.jurnal });
      });
    }
    return out;
  }

  /* ---------- Penilaian ---------- */
  const JENIS = ['Tugas', 'Formatif', 'Sumatif'];
  const nilaiId = (idPenilaian, idSiswa) => `nil-${hash(`${idPenilaian}|${idSiswa}`)}`;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  /** Menerima 85, "85", dan "85,5". Kosong menjadi '', isian salah menjadi null. */
  function parseScore(v) {
    const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
    if (s === '') return '';
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }

  /** Nilai pada skala 100 setelah remedial. rule: batas_kktp atau penuh. */
  function effectiveScore(row, penilaian, kktp, rule) {
    if (!row) return null;
    const max = Number(penilaian.nilai_maks) || 100;
    const n = parseScore(row.nilai);
    const r = parseScore(row.remedial);
    const base = typeof n === 'number' ? (n / max) * 100 : null;
    let extra = typeof r === 'number' ? (r / max) * 100 : null;
    if (extra !== null && rule !== 'penuh') extra = Math.min(extra, kktp);
    if (base === null && extra === null) return null;
    return round2(Math.max(base === null ? 0 : base, extra === null ? 0 : extra));
  }

  const assessments = (db, idPengampuan) => db.Penilaian.filter((p) => p.id_pengampuan === idPengampuan)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama, 'id'));

  function validateEntry(e, penilaian) {
    const max = Number(penilaian.nilai_maks) || 100;
    const n = parseScore(e.nilai);
    const r = parseScore(e.remedial);
    if (n === null || r === null) return 'Nilai harus berupa angka.';
    if ((n !== '' && n > max) || (r !== '' && r > max)) return `Nilai tidak boleh lebih dari ${max}.`;
    return null;
  }

  function saveNilai(db, penilaian, entries) {
    const existing = new Map(db.Nilai.filter((n) => n.id_penilaian === penilaian.id_penilaian).map((n) => [n.id_siswa, n]));
    const changes = [];
    entries.forEach((e) => {
      const old = existing.get(e.id_siswa);
      const clean = (v) => { const p = parseScore(v); return p === '' || p === null ? '' : String(p); };
      const next = { nilai: clean(e.nilai), remedial: clean(e.remedial), catatan: String(e.catatan || '').trim() };
      const empty = !next.nilai && !next.remedial && !next.catatan;
      if (empty) {
        if (old) changes.push({ table: 'Nilai', row: { ...old, deleted: '1' } });
        return;
      }
      if (old && old.nilai === next.nilai && (old.remedial || '') === next.remedial && (old.catatan || '') === next.catatan) return;
      changes.push({ table: 'Nilai', row: { ...(old || {}), id_nilai: nilaiId(penilaian.id_penilaian, e.id_siswa), id_penilaian: penilaian.id_penilaian, id_siswa: e.id_siswa, ...next } });
    });
    return changes;
  }

  function deletePenilaian(db, id) {
    const target = db.Penilaian.find((p) => p.id_penilaian === id);
    if (!target) return [];
    return [{ table: 'Penilaian', row: { ...target, deleted: '1' } },
      ...db.Nilai.filter((n) => n.id_penilaian === id).map((row) => ({ table: 'Nilai', row: { ...row, deleted: '1' } }))];
  }

  const average = (list) => (list.length ? round2(list.reduce((a, b) => a + b, 0) / list.length) : null);

  /** Rekap kelas. Tugas dan Formatif masuk kelompok formatif. */
  function gradeSummary(db, ampu, rule) {
    const kktp = Number(ampu.kktp) || 0;
    const bf = Number(ampu.bobot_formatif) || 0;
    const bs = Number(ampu.bobot_sumatif) || 0;
    const items = assessments(db, ampu.id_pengampuan);
    const ids = new Set(items.map((p) => p.id_penilaian));
    const byStudent = new Map();
    db.Nilai.filter((n) => ids.has(n.id_penilaian)).forEach((n) => {
      if (!byStudent.has(n.id_siswa)) byStudent.set(n.id_siswa, new Map());
      byStudent.get(n.id_siswa).set(n.id_penilaian, n);
    });
    const students = roster(db, ampu, '');
    const known = new Set(students.map((s) => s.id_siswa));
    db.Siswa.forEach((s) => { if (byStudent.has(s.id_siswa) && !known.has(s.id_siswa)) students.push(s); });
    students.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    const rows = students.map((s) => {
      const scores = byStudent.get(s.id_siswa) || new Map();
      const cells = items.map((p) => effectiveScore(scores.get(p.id_penilaian), p, kktp, rule));
      const group = (test) => cells.filter((c, i) => c !== null && test(items[i]));
      const formatif = average(group((p) => p.jenis !== 'Sumatif'));
      const sumatif = average(group((p) => p.jenis === 'Sumatif'));
      const needF = bf > 0;
      const needS = bs > 0;
      const akhir = (needF && formatif === null) || (needS && sumatif === null) || (!needF && !needS)
        ? null : round2(((needF ? formatif * bf : 0) + (needS ? sumatif * bs : 0)) / 100);
      const kosong = cells.filter((c) => c === null).length;
      let status = 'Belum lengkap';
      if (akhir !== null && !kosong) status = akhir >= kktp ? 'Tuntas' : 'Belum tuntas';
      return { id_siswa: s.id_siswa, nama: s.nama, nisn: s.nisn, cells, formatif, sumatif, akhir, kosong, status };
    });
    const finals = rows.filter((r) => r.akhir !== null).map((r) => r.akhir);
    return {
      items, rows, kktp, bf, bs,
      rata: average(finals),
      tuntas: rows.filter((r) => r.status === 'Tuntas').length,
      belum: rows.filter((r) => r.status === 'Belum tuntas').length,
      lengkap: rows.filter((r) => r.status === 'Belum lengkap').length,
    };
  }

  function assessmentStats(db, ampu, penilaian, rule) {
    const kktp = Number(ampu.kktp) || 0;
    const scores = db.Nilai.filter((n) => n.id_penilaian === penilaian.id_penilaian)
      .map((n) => effectiveScore(n, penilaian, kktp, rule)).filter((x) => x !== null);
    return { filled: scores.length, total: roster(db, ampu, '').length, rata: average(scores), kurang: scores.filter((x) => x < kktp).length };
  }

  root.GM.Teaching = {
    STATUS, pertemuanId, presensiId, jurnalId, ymd, parseYmd, hariOf, addDays, roster, sessions,
    ensureSession, savePresensi, saveJurnal, deleteSession, sessionStatus, absent, recap, reminders,
    JENIS, nilaiId, parseScore, effectiveScore, assessments, validateEntry, saveNilai, deletePenilaian, gradeSummary, assessmentStats,
  };
})(typeof window !== 'undefined' ? window : globalThis);
