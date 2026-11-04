/* Menyusun isi laporan. Hasilnya dipakai bersama oleh tampilan cetak dan Excel. */
(function (root) {
  const T = () => root.GM.Teaching;

  const KINDS = [
    { id: 'hadir', label: 'Daftar Hadir', needsAmpu: true, dates: true },
    { id: 'jurnal', label: 'Jurnal Mengajar', allowAll: true, dates: true },
    { id: 'nilai', label: 'Daftar Nilai', needsAmpu: true },
    { id: 'ketuntasan', label: 'Ketuntasan Belajar', needsAmpu: true },
    { id: 'rekap', label: 'Rekap per Kelas', dates: true },
  ];

  const dmy = (t) => { const [y, m, d] = t.split('-'); return `${d}/${m}/${y}`; };
  const dm = (t) => { const [, m, d] = t.split('-'); return `${d}/${m}`; };
  const inRange = (t, from, to) => (!from || t >= from) && (!to || t <= to);
  const rangeText = (from, to) => {
    if (from && to) return `${dmy(from)} s.d. ${dmy(to)}`;
    if (from) return `Sejak ${dmy(from)}`;
    if (to) return `Sampai ${dmy(to)}`;
    return 'Semua tanggal';
  };

  function names(db, ampu) {
    const mapel = db.Mapel.find((m) => m.id_mapel === ampu.id_mapel) || {};
    const kelas = db.Kelas.find((k) => k.id_kelas === ampu.id_kelas) || {};
    const tahun = db.TahunAjaran.find((t) => t.id_tahun === ampu.id_tahun) || {};
    return { mapel: mapel.nama_mapel || '?', kelas: kelas.nama_kelas || '?', tahun: tahun.tahun || '?', semester: tahun.semester || '?' };
  }
  const ampuMeta = (db, ampu, guru) => {
    const n = names(db, ampu);
    return [['Mata pelajaran', n.mapel], ['Kelas', n.kelas], ['Tahun ajaran', `${n.tahun} ${n.semester}`], ['Guru', guru || '–']];
  };
  const fileName = (title, ampu, db) => {
    const tail = ampu ? `-${names(db, ampu).mapel}-${names(db, ampu).kelas}` : '';
    return `${title}${tail}`.replace(/[^\w-]+/g, '-');
  };

  function hadir(db, o) {
    const sessions = T().sessions(db, o.ampu.id_pengampuan).filter((p) => inRange(p.tanggal, o.from, o.to));
    const ids = new Set(sessions.map((p) => p.id_pertemuan));
    const marks = new Map();
    db.Presensi.filter((p) => ids.has(p.id_pertemuan)).forEach((p) => marks.set(`${p.id_pertemuan}|${p.id_siswa}`, p));
    const recorded = new Set([...marks.values()].map((p) => p.id_siswa));
    const students = T().roster(db, o.ampu, '');
    const known = new Set(students.map((s) => s.id_siswa));
    db.Siswa.forEach((s) => { if (recorded.has(s.id_siswa) && !known.has(s.id_siswa)) students.push(s); });
    students.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    const rows = students.map((s, i) => {
      const c = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
      const cells = sessions.map((p) => {
        const m = marks.get(`${p.id_pertemuan}|${s.id_siswa}`);
        if (!m) return '';
        c[m.status] += 1;
        return m.status[0];
      });
      const total = c.Hadir + c.Sakit + c.Izin + c.Alpa;
      return [i + 1, s.nama, s.jk, ...cells, c.Hadir, c.Sakit, c.Izin, c.Alpa, total ? Math.round((c.Hadir / total) * 1000) / 10 : ''];
    });
    const present = sessions.map((p) => [...marks.values()].filter((m) => m.id_pertemuan === p.id_pertemuan && m.status === 'Hadir').length);
    return {
      title: 'Daftar Hadir Siswa', orientation: sessions.length > 8 ? 'landscape' : 'portrait',
      meta: [...ampuMeta(db, o.ampu, o.guru), ['Periode', rangeText(o.from, o.to)]],
      head: ['No', 'Nama', 'L/P', ...sessions.map((p) => dm(p.tanggal)), 'H', 'S', 'I', 'A', '%'],
      align: ['r', 'l', 'c', ...sessions.map(() => 'c'), 'r', 'r', 'r', 'r', 'r'],
      rows, foot: sessions.length ? ['', 'Jumlah hadir', '', ...present, '', '', '', '', ''] : null,
      notes: ['H = Hadir, S = Sakit, I = Izin, A = Alpa.'],
      empty: sessions.length ? '' : 'Belum ada pertemuan pada periode ini.',
      file: fileName('Daftar-Hadir', o.ampu, db),
    };
  }

  function jurnal(db, o) {
    const allowed = new Map(o.list.map((p) => [p.id_pengampuan, p]));
    const sessions = db.Pertemuan.filter((p) => allowed.has(p.id_pengampuan) && (!o.ampu || p.id_pengampuan === o.ampu.id_pengampuan) && inRange(p.tanggal, o.from, o.to))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const journals = new Map(db.Jurnal.map((j) => [j.id_pertemuan, j]));
    const siswa = new Map(db.Siswa.map((s) => [s.id_siswa, s]));
    const rows = sessions.map((p) => {
      const j = journals.get(p.id_pertemuan) || {};
      const n = names(db, allowed.get(p.id_pengampuan));
      const hari = T().hariOf(p.tanggal);
      const jam = db.Jadwal.filter((x) => x.id_pengampuan === p.id_pengampuan && x.hari === hari).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai))[0];
      const absent = T().absent(db, p.id_pertemuan).map((a) => `${(siswa.get(a.id_siswa) || {}).nama || '?'} (${a.status[0]})`).join(', ');
      return [`${hari}, ${dmy(p.tanggal)}`, `${n.mapel} ${n.kelas}`, jam ? (jam.jam_ke || jam.jam_mulai) : '–', Number(p.pertemuan_ke), j.materi || '(belum diisi)', j.kegiatan || '', j.catatan || '', absent];
    });
    const meta = o.ampu ? [...ampuMeta(db, o.ampu, o.guru), ['Periode', rangeText(o.from, o.to)]] : [['Guru', o.guru || '–'], ['Periode', rangeText(o.from, o.to)]];
    return {
      title: 'Jurnal Mengajar', orientation: 'landscape', meta,
      head: ['Hari, tanggal', 'Mapel dan kelas', 'Jam', 'Ke', 'Materi', 'Kegiatan', 'Catatan kelas', 'Tidak hadir'],
      align: ['l', 'l', 'c', 'r', 'l', 'l', 'l', 'l'], rows, foot: null, notes: [],
      empty: sessions.length ? '' : 'Belum ada pertemuan pada periode ini.',
      file: fileName('Jurnal-Mengajar', o.ampu, db),
    };
  }

  function nilai(db, o) {
    const g = T().gradeSummary(db, o.ampu, o.rule);
    const codes = g.items.map((p, i) => `P${i + 1}`);
    const blank = (v) => (v === null ? '' : v);
    return {
      title: 'Daftar Nilai', orientation: g.items.length > 5 ? 'landscape' : 'portrait',
      meta: [...ampuMeta(db, o.ampu, o.guru), ['KKTP', g.kktp], ['Bobot', `Formatif ${g.bf}%, Sumatif ${g.bs}%`]],
      head: ['No', 'Nama', ...codes, 'Formatif', 'Sumatif', 'Akhir'],
      align: ['r', 'l', ...codes.map(() => 'r'), 'r', 'r', 'r'],
      rows: g.rows.map((r, i) => [i + 1, r.nama, ...r.cells.map(blank), blank(r.formatif), blank(r.sumatif), blank(r.akhir)]),
      foot: null,
      notes: [...g.items.map((p, i) => `${codes[i]} = ${p.nama} (${p.jenis})`), 'Nilai sudah pada skala 100 dan sudah memperhitungkan remedial.'],
      empty: g.items.length ? '' : 'Belum ada penilaian.',
      file: fileName('Daftar-Nilai', o.ampu, db),
    };
  }

  function ketuntasan(db, o) {
    const g = T().gradeSummary(db, o.ampu, o.rule);
    const follow = { Tuntas: 'Pengayaan', 'Belum tuntas': 'Remedial', 'Belum lengkap': 'Lengkapi nilai' };
    const finals = g.rows.filter((r) => r.status !== 'Belum lengkap').map((r) => r.akhir);
    const decided = g.tuntas + g.belum;
    return {
      title: 'Laporan Ketuntasan Belajar', orientation: 'portrait',
      meta: [...ampuMeta(db, o.ampu, o.guru), ['KKTP', g.kktp]],
      stats: [['Rata-rata', g.rata], ['Tertinggi', finals.length ? Math.max(...finals) : null], ['Terendah', finals.length ? Math.min(...finals) : null],
        ['Tuntas', g.tuntas], ['Belum tuntas', g.belum], ['Belum lengkap', g.lengkap], ['% Tuntas', decided ? Math.round((g.tuntas / decided) * 1000) / 10 : null]],
      head: ['No', 'Nama', 'Nilai akhir', 'Status', 'Tindak lanjut'], align: ['r', 'l', 'r', 'l', 'l'],
      rows: g.rows.map((r, i) => [i + 1, r.nama, r.akhir === null ? '' : r.akhir, r.status, follow[r.status]]),
      foot: null, notes: ['% Tuntas dihitung dari siswa yang nilainya sudah lengkap.'],
      empty: g.items.length ? '' : 'Belum ada penilaian.',
      file: fileName('Ketuntasan', o.ampu, db),
    };
  }

  function rekap(db, o) {
    const rows = o.list.map((ampu) => {
      const n = names(db, ampu);
      const a = T().recap(db, ampu, o.from, o.to);
      const g = T().gradeSummary(db, ampu, o.rule);
      return [n.mapel, n.kelas, T().roster(db, ampu, '').length, a.sessions, a.kelas.persen === null ? '' : a.kelas.persen, a.kelas.Alpa, Number(ampu.kktp) || 0, g.rata === null ? '' : g.rata, g.tuntas, g.belum, g.lengkap];
    }).sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'id') || String(x[1]).localeCompare(String(y[1]), 'id'));
    return {
      title: 'Rekap per Kelas', orientation: 'landscape', meta: [['Guru', o.guru || '–'], ['Tahun ajaran', o.yearLabel || '–'], ['Periode kehadiran', rangeText(o.from, o.to)]],
      head: ['Mapel', 'Kelas', 'Siswa', 'Pertemuan', '% Hadir', 'Alpa', 'KKTP', 'Rata-rata nilai', 'Tuntas', 'Belum tuntas', 'Belum lengkap'],
      align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], rows, foot: null, notes: [],
      empty: rows.length ? '' : 'Belum ada Pengampuan pada tahun ajaran aktif.',
      file: fileName('Rekap-per-Kelas', null, db),
    };
  }

  const builders = { hadir, jurnal, nilai, ketuntasan, rekap };
  const build = (kind, db, options) => builders[kind](db, options);

  function workbook(XLSX, report, settings) {
    const aoa = [[settings.sekolah || ''], [report.title], []];
    report.meta.forEach((m) => aoa.push(m));
    (report.stats || []).forEach(([k, v]) => aoa.push([k, v === null ? '' : v]));
    aoa.push([], report.head, ...report.rows);
    if (report.foot) aoa.push(report.foot);
    if (report.notes.length) aoa.push([], ...report.notes.map((n) => [n]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = report.head.map((h, i) => ({ wch: report.align[i] === 'l' ? 24 : 9 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31));
    return wb;
  }

  root.GM.Reports = { KINDS, build, workbook, dmy };
})(typeof window !== 'undefined' ? window : globalThis);
