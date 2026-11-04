/* Data contoh fiktif. Semua baris diberi tanda id_import = CONTOH agar mudah dihapus. */
(function (root) {
  const { SAMPLE_MARK } = root.GM.Schema;
  const DEPAN = ['Adit', 'Bagas', 'Cindy', 'Dewi', 'Eko', 'Farah', 'Galih', 'Hana', 'Irfan', 'Jihan', 'Kevin', 'Laras', 'Maulana', 'Nadia', 'Oki', 'Putu', 'Qori', 'Rizky', 'Salsa', 'Teguh', 'Ulfa', 'Vino', 'Wulan', 'Yusuf', 'Zahra', 'Anita', 'Bima', 'Citra', 'Dimas', 'Elsa'];
  const BELAKANG = ['Pratama', 'Lestari', 'Saputra', 'Wulandari', 'Nugraha', 'Maharani', 'Ramadhan', 'Anggraini', 'Hidayat', 'Permata'];
  const PEREMPUAN = new Set(['Cindy', 'Dewi', 'Farah', 'Hana', 'Jihan', 'Laras', 'Nadia', 'Qori', 'Salsa', 'Ulfa', 'Wulan', 'Zahra', 'Anita', 'Citra', 'Elsa']);

  function build() {
    const mark = { id_import: SAMPLE_MARK };
    const year = { id_tahun: 'contoh-tahun-1', tahun: '2026/2027', semester: 'Ganjil', aktif: '1', ...mark };
    const mapel = ['A', 'B', 'C'].map((x) => ({ id_mapel: `contoh-mapel-${x}`, kode: `MP${x}`, nama_mapel: `Mapel ${x}`, ...mark }));
    const kelas = [['VII-A', 'VII'], ['VII-B', 'VII'], ['VIII-A', 'VIII']].map(([n, t], i) => ({ id_kelas: `contoh-kelas-${i + 1}`, nama_kelas: n, tingkat: t, ...mark }));
    const siswa = [];
    const anggota = [];
    DEPAN.forEach((nama, i) => {
      const k = kelas[Math.floor(i / 10)];
      const id = `contoh-siswa-${i + 1}`;
      siswa.push({ id_siswa: id, nis: String(2601 + i), nisn: String(9900000001 + i).padStart(10, '0'), nama: `${nama} ${BELAKANG[i % 10]}`, jk: PEREMPUAN.has(nama) ? 'P' : 'L', status: 'Aktif', ...mark });
      anggota.push({ id_anggota: `contoh-anggota-${i + 1}`, id_tahun: year.id_tahun, id_kelas: k.id_kelas, id_siswa: id, ...mark });
    });
    const p = (n, m, k) => ({ id_pengampuan: `contoh-ampu-${n}`, id_tahun: year.id_tahun, id_mapel: mapel[m].id_mapel, id_kelas: kelas[k].id_kelas, kktp: '75', bobot_formatif: '40', bobot_sumatif: '60', ...mark });
    const ampu = [p(1, 0, 0), p(2, 0, 1), p(3, 1, 0), p(4, 2, 2)];
    const j = (n, a, hari, m, s, ke) => ({ id_jadwal: `contoh-jadwal-${n}`, id_pengampuan: ampu[a].id_pengampuan, hari, jam_mulai: m, jam_selesai: s, jam_ke: ke, ...mark });
    const jadwal = [j(1, 0, 'Senin', '07:30', '09:00', '1-2'), j(2, 1, 'Selasa', '09:15', '10:45', '3-4'), j(3, 2, 'Rabu', '07:30', '09:00', '1-2'), j(4, 3, 'Kamis', '10:45', '12:15', '5-6'), j(5, 0, 'Jumat', '07:30', '09:00', '1-2')];
    const out = [];
    const add = (table, rows) => rows.forEach((row) => out.push({ table, row }));
    add('TahunAjaran', [year]); add('Mapel', mapel); add('Kelas', kelas); add('Siswa', siswa);
    add('AnggotaKelas', anggota); add('Pengampuan', ampu); add('Jadwal', jadwal);
    return out;
  }

  /** File latihan: sengaja berisi data baru, data sama, data berubah, dan baris bermasalah. */
  function practiceBook(XLSX) {
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add('Mapel', [['kode', 'nama_mapel'], ['MPA', 'Mapel A'], ['MPD', 'Mapel D']]);
    add('Kelas', [['nama_kelas', 'tingkat'], ['VII-A', 'VII'], ['VIII-B', '']]);
    add('Siswa', [
      ['nisn', 'nis', 'nama', 'jk', 'kelas', 'status'],
      ['9900000001', '2601', 'Adit Pratama', 'L', 'VII-A', 'Aktif'],
      ['9900000002', '2602', 'Bagas Lestari Putra', 'L', 'VII-A', 'Aktif'],
      ['9900000101', '2701', 'Raka Mahendra', 'L', 'VIII-B', 'Aktif'],
      ['9900000102', '2702', 'Sinta Puspita', 'Perempuan', 'VIII-B', ''],
      ['12345678', '2703', 'Tono Wijaya', 'L', 'VIII-B', 'Aktif'],
      ['9900000104', '2704', 'Umi Kalsum', 'P', 'VII-C', 'Aktif'],
      ['', '', 'Vina Oktavia', 'P', 'VIII-B', 'Aktif'],
    ]);
    add('Pengampuan', [['mapel', 'kelas', 'kktp', 'bobot_formatif', 'bobot_sumatif'], ['Mapel D', 'VIII-B', '78', '50', '50'], ['Mapel A', 'VII-A', '80', '40', '50']]);
    add('Jadwal', [['mapel', 'kelas', 'hari', 'jam_mulai', 'jam_selesai', 'jam_ke'], ['Mapel D', 'VIII-B', 'Sabtu', '08.00', '09.30', '2-3'], ['Mapel D', 'VIII-B', 'Senin', '08:00', '09:30', '2-3']]);
    return wb;
  }

  root.GM.Sample = { build, practiceBook };
})(typeof window !== 'undefined' ? window : globalThis);
