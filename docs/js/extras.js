/* Logika Catatan Siswa, Bank Soal, Analisis Nilai, Kalender, dan Tugas Siswa. */
(function (root) {
  const T = () => root.GM.Teaching;
  const KATEGORI = ['Perkembangan', 'Sikap', 'Prestasi', 'Perlu perhatian'];
  const KESULITAN = ['Mudah', 'Sedang', 'Sulit'];
  const TIPE_SOAL = ['Pilihan ganda', 'Uraian'];
  const JENIS_KALENDER = ['Libur', 'Ujian', 'Kegiatan'];
  const OPSI = ['a', 'b', 'c', 'd', 'e'];

  /* ---------- Kalender ---------- */
  const eventsOn = (db, tanggal) => (db.Kalender || []).filter((k) => k.tanggal_mulai <= tanggal && tanggal <= (k.tanggal_selesai || k.tanggal_mulai))
    .sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
  const isLibur = (db, tanggal) => eventsOn(db, tanggal).some((k) => k.jenis === 'Libur');

  function upcoming(db, today, days = 14) {
    const end = T().addDays(today, days);
    return (db.Kalender || []).filter((k) => (k.tanggal_selesai || k.tanggal_mulai) >= today && k.tanggal_mulai <= end)
      .sort((a, b) => a.tanggal_mulai.localeCompare(b.tanggal_mulai));
  }

  /** Minggu kalender dimulai Senin. Setiap sel berisi tanggal atau null. */
  function monthGrid(year, month) {
    const pad = (n) => String(n).padStart(2, '0');
    const count = new Date(year, month, 0).getDate();
    const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const cells = Array(lead).fill(null);
    for (let d = 1; d <= count; d += 1) cells.push(`${year}-${pad(month)}-${pad(d)}`);
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function effectiveDays(db, year, month, schoolDays) {
    return monthGrid(year, month).filter((t) => {
      if (!t) return false;
      const day = (T().parseYmd(t).getDay() + 6) % 7;
      return day < schoolDays && !isLibur(db, t);
    }).length;
  }

  /* ---------- Tugas ---------- */
  const kumpulId = (idTugas, idSiswa) => `kmp-${T().hash(`${idTugas}|${idSiswa}`)}`;

  function taskRows(db, tugas, ampu) {
    const saved = new Map(db.PengumpulanTugas.filter((p) => p.id_tugas === tugas.id_tugas).map((p) => [p.id_siswa, p]));
    const students = T().roster(db, ampu, '');
    const known = new Set(students.map((s) => s.id_siswa));
    db.Siswa.forEach((s) => { if (saved.has(s.id_siswa) && !known.has(s.id_siswa)) students.push(s); });
    return students.sort((a, b) => a.nama.localeCompare(b.nama, 'id')).map((s) => {
      const row = saved.get(s.id_siswa) || null;
      const done = row && row.tanggal_kumpul;
      let state = 'Belum';
      if (done) state = row.tanggal_kumpul > tugas.tenggat ? 'Terlambat' : 'Tepat waktu';
      return { siswa: s, row, state };
    });
  }

  function taskStats(db, tugas, ampu) {
    const rows = taskRows(db, tugas, ampu);
    const n = (s) => rows.filter((r) => r.state === s).length;
    return { total: rows.length, tepat: n('Tepat waktu'), terlambat: n('Terlambat'), belum: n('Belum') };
  }

  function saveKumpul(db, tugas, entries) {
    const existing = new Map(db.PengumpulanTugas.filter((p) => p.id_tugas === tugas.id_tugas).map((p) => [p.id_siswa, p]));
    const changes = [];
    entries.forEach((e) => {
      const old = existing.get(e.id_siswa);
      const tanggal = e.tanggal_kumpul || '';
      const catatan = String(e.catatan || '').trim();
      if (!tanggal && !catatan) {
        if (old) changes.push({ table: 'PengumpulanTugas', row: { ...old, deleted: '1' } });
        return;
      }
      if (old && old.tanggal_kumpul === tanggal && (old.catatan || '') === catatan) return;
      changes.push({ table: 'PengumpulanTugas', row: { ...(old || {}), id_kumpul: kumpulId(tugas.id_tugas, e.id_siswa), id_tugas: tugas.id_tugas, id_siswa: e.id_siswa, tanggal_kumpul: tanggal, catatan } });
    });
    return changes;
  }

  function deleteTugas(db, id) {
    const target = db.Tugas.find((t) => t.id_tugas === id);
    if (!target) return [];
    return [{ table: 'Tugas', row: { ...target, deleted: '1' } }, ...db.PengumpulanTugas.filter((p) => p.id_tugas === id).map((row) => ({ table: 'PengumpulanTugas', row: { ...row, deleted: '1' } }))];
  }

  /* ---------- Bank Soal ---------- */
  function validateSoal(s) {
    if (!String(s.soal || '').trim()) return 'Isi soal wajib diisi.';
    if (s.tipe !== 'Pilihan ganda') return null;
    const filled = OPSI.filter((o) => String(s[`opsi_${o}`] || '').trim());
    if (filled.length < 2) return 'Pilihan ganda minimal punya 2 opsi.';
    const k = String(s.kunci || '').trim().toLowerCase();
    if (!OPSI.includes(k)) return 'Kunci jawaban harus A sampai E.';
    if (!filled.includes(k)) return `Opsi ${k.toUpperCase()} masih kosong.`;
    return null;
  }

  /* ---------- Analisis Nilai ---------- */
  const BUCKETS = [[0, 60, '0–59'], [60, 70, '60–69'], [70, 80, '70–79'], [80, 90, '80–89'], [90, 100.01, '90–100']];

  function analyze(db, ampu, rule) {
    const g = T().gradeSummary(db, ampu, rule);
    const kktp = g.kktp;
    const average = (l) => (l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 100) / 100 : null);
    const items = g.items.map((p, i) => {
      const scores = g.rows.map((r) => r.cells[i]).filter((c) => c !== null);
      const below = scores.filter((c) => c < kktp).length;
      return { penilaian: p, rata: average(scores), filled: scores.length, below, persen: scores.length ? Math.round((below / scores.length) * 1000) / 10 : null };
    });
    const hardest = items.filter((x) => x.rata !== null).sort((a, b) => a.rata - b.rata).slice(0, 5);
    const finals = g.rows.map((r) => r.akhir).filter((x) => x !== null);
    const distribution = BUCKETS.map(([lo, hi, label]) => ({ label, count: finals.filter((f) => f >= lo && f < hi).length }));
    const tpStats = T().tpForAmpu(db, ampu).map((tp) => {
      const linked = items.filter((x) => x.penilaian.id_tp === tp.id_tp && x.rata !== null);
      return { tp, count: linked.length, rata: average(linked.map((x) => x.rata)) };
    });
    const attendance = new Map(T().recap(db, ampu, '', '').rows.map((r) => [r.id_siswa, r]));
    const support = g.rows.map((r) => {
      const a = attendance.get(r.id_siswa);
      const lows = r.cells.filter((c) => c !== null && c < kktp).length;
      const reasons = [];
      if (r.akhir !== null && r.akhir < kktp) reasons.push(`Nilai akhir ${String(r.akhir).replace('.', ',')}`);
      if (lows >= 2) reasons.push(`${lows} penilaian di bawah KKTP`);
      if (a && a.total >= 4 && a.persen < 80) reasons.push(`Kehadiran ${String(a.persen).replace('.', ',')}%`);
      if (a && a.Alpa >= 3) reasons.push(`Alpa ${a.Alpa} kali`);
      return { id_siswa: r.id_siswa, nama: r.nama, akhir: r.akhir, reasons };
    }).filter((s) => s.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.nama.localeCompare(b.nama, 'id'));
    return { kktp, rata: g.rata, tuntas: g.tuntas, belum: g.belum, lengkap: g.lengkap, items, hardest, distribution, tpStats, support };
  }

  root.GM.Extras = {
    KATEGORI, KESULITAN, TIPE_SOAL, JENIS_KALENDER, OPSI, eventsOn, isLibur, upcoming, monthGrid, effectiveDays,
    kumpulId, taskRows, taskStats, saveKumpul, deleteTugas, validateSoal, analyze,
  };
})(typeof window !== 'undefined' ? window : globalThis);
