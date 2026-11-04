/* Struktur data. Harus sama dengan SCHEMA di gas/Code.gs. */
(function (root) {
  const META_COLS = ['created_at', 'updated_at', 'deleted', 'device_id', 'id_import', '_rev'];
  const TABLES = {
    Pengaturan: { pk: 'key' },
    TahunAjaran: { pk: 'id_tahun' },
    Mapel: { pk: 'id_mapel' },
    Kelas: { pk: 'id_kelas' },
    Siswa: { pk: 'id_siswa' },
    AnggotaKelas: { pk: 'id_anggota' },
    Pengampuan: { pk: 'id_pengampuan' },
    Jadwal: { pk: 'id_jadwal' },
    Pertemuan: { pk: 'id_pertemuan' },
    Presensi: { pk: 'id_presensi' },
    Jurnal: { pk: 'id_jurnal' },
    TP: { pk: 'id_tp' },
    Penilaian: { pk: 'id_penilaian' },
    Nilai: { pk: 'id_nilai' },
    CatatanSiswa: { pk: 'id_catatan' },
    BankSoal: { pk: 'id_soal' },
    Kalender: { pk: 'id_kalender' },
    Tugas: { pk: 'id_tugas' },
    PengumpulanTugas: { pk: 'id_kumpul' },
    ImportLog: { pk: 'id_import' },
  };
  /* Baris yang menunjuk ke baris lain. Dipakai agar data yang masih dipakai tidak terhapus. */
  const REFS = {
    TahunAjaran: [['AnggotaKelas', 'id_tahun'], ['Pengampuan', 'id_tahun']],
    Mapel: [['Pengampuan', 'id_mapel'], ['TP', 'id_mapel'], ['BankSoal', 'id_mapel']],
    Kelas: [['AnggotaKelas', 'id_kelas'], ['Pengampuan', 'id_kelas']],
    Siswa: [['AnggotaKelas', 'id_siswa'], ['Presensi', 'id_siswa'], ['Nilai', 'id_siswa'], ['CatatanSiswa', 'id_siswa'], ['PengumpulanTugas', 'id_siswa']],
    Pengampuan: [['Jadwal', 'id_pengampuan'], ['Pertemuan', 'id_pengampuan'], ['Penilaian', 'id_pengampuan'], ['Tugas', 'id_pengampuan']],
    TP: [['Pertemuan', 'id_tp'], ['Penilaian', 'id_tp'], ['BankSoal', 'id_tp']],
  };
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const SAMPLE_MARK = 'CONTOH';
  const api = { META_COLS, TABLES, REFS, HARI, SAMPLE_MARK };
  root.GM = root.GM || {};
  root.GM.Schema = api;
})(typeof window !== 'undefined' ? window : globalThis);
