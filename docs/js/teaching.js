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

  root.GM.Teaching = {
    STATUS, pertemuanId, presensiId, jurnalId, ymd, parseYmd, hariOf, addDays, roster, sessions,
    ensureSession, savePresensi, saveJurnal, deleteSession, sessionStatus, absent, recap, reminders,
  };
})(typeof window !== 'undefined' ? window : globalThis);
