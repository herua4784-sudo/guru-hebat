# Guru Mapel

Aplikasi guru mata pelajaran semi-online. Tahap pertama: Login PIN, Beranda, Data Master, Import, dan sinkronisasi.

| Folder | Isi |
|---|---|
| `docs/` | Tampilan aplikasi untuk GitHub Pages (PWA, bisa offline) |
| `gas/` | Kode Google Apps Script |
| `tests/` | Pengujian untuk pengembangan, tidak perlu dipasang |

## Pemasangan

### 1. Spreadsheet dan Apps Script
1. Buat Google Spreadsheet baru, misalnya bernama `Database Guru Mapel`.
2. Buka **Ekstensi > Apps Script**.
3. Tempel isi `gas/Code.gs` ke editor, lalu simpan.
4. Pilih fungsi `setup`, klik **Jalankan**, dan izinkan akses.
5. Buka **Eksekusi** (Execution log) atau kembali ke Spreadsheet untuk melihat **PIN awal**. Catat PIN ini.

Lupa PIN: buka Spreadsheet, pilih menu **Guru Mapel > Buat PIN baru**.

### 2. Web App
1. Di Apps Script pilih **Terapkan > Deployment baru > Aplikasi web**.
2. Jalankan sebagai: **Saya**. Yang memiliki akses: **Siapa saja** (Anyone).
3. Klik **Terapkan**, lalu salin alamat yang diakhiri `/exec`.

Jika `Code.gs` diubah nanti: **Terapkan > Kelola deployment > Edit > Versi baru**. Alamat tidak berubah.

### 3. GitHub Pages
1. Buat repository baru, lalu unggah seluruh isi paket ini.
2. Isi `API_URL` pada `docs/config.js` dengan alamat `/exec`.
3. Buka **Settings > Pages**. Pada Source pilih **Deploy from a branch**, branch `main`, folder `/docs`.
4. Buka alamat yang diberikan GitHub, masukkan PIN awal, lalu ganti PIN di menu Pengaturan.
5. Di HP, pilih **Tambahkan ke layar utama** agar terpasang seperti aplikasi.

## Aturan penting
- Ubah data lewat aplikasi, bukan langsung di Spreadsheet. Perubahan manual di sheet tidak terkirim ke perangkat.
- Jangan menaruh data siswa di repository. Repository hanya berisi kode tampilan.
- Perubahan offline tersimpan di perangkat dan terkirim otomatis saat online.
- Jika dua perangkat mengubah baris yang sama, perubahan dengan waktu terbaru yang dipakai.
- Data di perangkat tidak dienkripsi. PIN mengunci tampilan aplikasi, jadi gunakan juga kunci layar HP.
- PIN salah 5 kali mengunci login selama 15 menit.

## Menjalankan pengujian
```
export XLSX_PATH=$PWD/docs/vendor/xlsx.full.min.js
node --test tests/logic.test.js
node tests/e2e.js /folder/sementara   # perlu Playwright
```
Pengujian memakai `gas/Code.gs` asli di atas tiruan layanan Google.
