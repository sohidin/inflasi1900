# Dashboard Inflasi 1900 — Versi 3

Versi ini tetap hanya 5 file:

- `Code.gs`
- `README.md`
- `index.html`
- `script.js`
- `style.css`

## Perbaikan V3

1. **Angka Final Inflasi**
   - Tabulasi 2 arah sekarang membaca seluruh kode kota pada tahun-bulan yang dipilih.
   - Bug sebelumnya terjadi karena backend berhenti pada blok kode kota pertama.

2. **Komoditas Andil**
   - Berlaku untuk Angka Sementara dan Angka Final.
   - Semua kabupaten/kota tampil sekaligus dalam satu halaman.
   - Urutan prioritas:
     1. 1902
     2. 1903
     3. 1906
     4. 1971
     5. 1900
   - Kode kota lain, bila ada, ditampilkan setelahnya.
   - Untuk setiap kab/kota ada dua tabel:
     - Andil Terendah
     - Andil Tertinggi
   - Mode:
     - Top 10
     - |Andil| >= 0,01

3. **Download satu halaman Komoditas Andil**
   - Excel
   - CSV
   - PDF satu halaman
   - Image satu halaman

## Cara Update

### Apps Script
Ganti seluruh `Code.gs`, lalu:

Deploy > Manage deployments > Edit > New version > Deploy

### GitHub
Ganti:
- `index.html`
- `script.js`
- `style.css`
- `README.md`

Jangan lupa isi `API_URL` di bagian atas `script.js`.
