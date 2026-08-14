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


## V4
- Sidebar redesign mengikuti referensi visual.
- Tetap menggunakan hide/unhide/accordion.
- Menu utama tampil seperti card.
- Submenu bertingkat tetap dipertahankan.
- Tambah tombol Buka Spreadsheet di bagian bawah sidebar.


## V5
- Fix tabulasi Angka Final: periode yang sama dikumpulkan dari seluruh blok kode kota.
- Cache diberi versi baru sehingga hasil lama yang hanya 1900 tidak digunakan.
- Urutan kolom kota: 1902, 1903, 1906, 1971, 1900, lalu kode lain.
- Komoditas Andil tetap menampilkan seluruh kab/kota.
- Excel/CSV/PDF/Image pada Komoditas Andil mengekspor seluruh kab/kota.
- PDF dibuat dari data seluruh kota (satu file PDF; satu halaman PDF per kab/kota agar tetap terbaca).
- Excel berisi sheet "Semua KabKota" dan sheet tambahan per kode kota.
- Tampilan sidebar dan konten diperhalus, tetap menggunakan hide/unhide accordion.


## V6
- Semua angka pada tampilan web menggunakan tepat 2 digit di belakang koma.
- Berlaku untuk seluruh menu Inflasi, Andil Inflasi, Inflasi Asem/Final, dan Komoditas Andil.
- PDF Komoditas Andil juga menggunakan 2 digit desimal.
- Ekspor CSV/Excel Komoditas Andil dibulatkan ke 2 digit desimal.
- CACHE_VERSION dinaikkan ke v6 agar cache lama yang hanya menampilkan kode kota 1900 tidak digunakan.
- Fix Final multi-kab/kota dari V5 tetap dipertahankan.
- Download Komoditas Andil tetap mencakup seluruh kab/kota.


## V7
- Global search untuk seluruh tabel Komoditas Andil.
- PDF/Image mengambil visual halaman web (card, header kota, tabel kiri-kanan).
- PDF otomatis dibagi menjadi beberapa halaman bila tinggi, namun visual web tetap dipertahankan.
- Semua download memuat jenis data (Angka Sementara/Angka Final Inflasi) serta tanggal dan jam download.
- Nama file Excel/CSV/PDF/Image juga memuat jenis data dan timestamp.


## V8
- Perbaikan export Komoditas Andil agar tidak terpotong.
- Image dirender sebagai satu canvas panjang berdasarkan tinggi aktual seluruh konten.
- PDF tidak lagi memotong screenshot panjang secara sembarang.
- PDF merender setiap card kab/kota sebagai satu unit, lalu menempatkan satu card per halaman A4 landscape.
- Jika sebuah card terlalu tinggi, card diperkecil proporsional agar seluruhnya tetap terlihat, bukan di-crop.
- Header jenis data dan waktu download tetap tampil pada setiap halaman PDF.
- Search global tetap dihormati saat ekspor.


## V8.1 Hotfix
- Fix syntax error deklarasi `firstPage` ganda pada `script.js` V8 yang membuat seluruh JavaScript berhenti, termasuk tombol login.
- Export PDF/Image anti-crop V8 tetap dipertahankan.


## V9
- Data per Angka Sementara ikut hasil download.
- Angka rata tengah dan header kab/kota 2 baris.
- Highlight inflasi tertinggi merah, terendah hijau per komoditas.
- Plus Jakarta Sans dan layout tabel lebih modern.
- Cache browser + period index backend untuk mempercepat pindah menu/filter.


## V10
- Menggunakan `index.html` hasil update manual user sebagai basis.
- Inflasi Asem disandingkan dengan Inflasi Final:
  - Final MtM / YtD / YoY
  - Sementara MtM / YtD / YoY
- Tahun dan bulan Final pembanding dapat dipilih sendiri.
- Default pembanding Final diarahkan ke bulan sebelumnya bila tersedia.
- Kode provinsi Final 1900 disamakan dengan kode provinsi Asem 19.
- PDF dan Image untuk menu standar dibuat dari tampilan web/card.
- Saat download, seluruh baris tabel dimunculkan sementara agar hasil tidak hanya halaman pertama.
- Header download memuat jenis data, data-per (untuk Asem), serta tanggal/jam download.


## V10.2
Header perbandingan Inflasi Asem sekarang memakai thead dua tingkat seperti merge cell:
- Kode Kota dan Nama Kota rowspan 2.
- Angka Final Pembanding colspan 3.
- Angka Sementara colspan 3.
- MtM/YtD/YoY tepat di bawah masing-masing grup.


## V10.3
- URL Apps Script sudah diisi:
  `https://script.google.com/macros/s/AKfycbxRShwpgw6QGet99PmR4dX7NznoeIR0p0FIFHdavU6XY3pe-1YCnXJt-UxHeegnbT6y/exec`
- Spreadsheet ID sudah dikunci ke:
  `1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI`
- Tidak perlu lagi mengedit `API_URL` secara manual setelah upload ke GitHub.


## V10.4 Login Fix
- Memperbaiki bug validasi `API_URL`.
- Versi sebelumnya salah memeriksa URL Apps Script yang benar sebagai URL yang belum diisi.
- Login sekarang benar-benar mengirim request ke Web App Apps Script.
- Ditambahkan pesan error koneksi/respons Apps Script yang lebih jelas.


## V10.5
- Alignment tabel Inflasi Asem vs Final diperbaiki.
- Header dan body memakai `colgroup` yang sama.
- `scrollX` dimatikan khusus tabel perbandingan.
- MtM/YtD/YoY dan angka body dibuat center presisi.
- Separator Final vs Sementara dibuat lebih jelas.


## V10.6
- Tabel Inflasi Asem vs Angka Final tidak lagi memakai DataTables.
- Header merge dibuat native HTML agar posisi kolom selalu presisi.
- Label diubah menjadi "Angka Final".
- Search, Excel, CSV, PDF, dan Image tetap tersedia.
