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


## V10.8
- Memperbaiki tombol download dan search yang dobel saat berpindah dari tabel Inflasi Asem vs Angka Final ke menu standar.
- Toolbar comparison lama sekarang dibersihkan sebelum tabel lain dirender.
- Wrapper DataTables lama dibersihkan secara defensif agar tidak menumpuk.
- Tambah pilihan jumlah baris: 25, 50, 100, 250, atau Semua.
- Pilihan jumlah baris disimpan di browser sehingga tetap sama saat pindah menu.
- `deferRender` dan `searchDelay` ditambahkan untuk mengurangi beban render dan pencarian pada tabel besar.


## V10.9
- Memunculkan kembali toolbar Download + Search pada menu Inflasi Asem.
- Penyebab sebelumnya: CSS V10.8 menyembunyikan `#comparisonToolbar`.
- PDF/Image seluruh kelompok menu menggunakan capture visual web:
  - Inflasi Asem vs Angka Final
  - Inflasi / Andil MtM, YtD, YoY
  - Inflasi Final
  - Komoditas Andil
- Excel/CSV tetap berupa data tabular agar mudah diolah.
- Clone export dibuat tanpa overflow/cropping agar layout, card, warna, header dan tabel mengikuti website.


## V10.10
- Toolbar Inflasi Asem (Excel/CSV/PDF/Image + Search) menjadi elemen permanen di index.html.
- JavaScript hanya melakukan show/hide sehingga toolbar tidak hilang saat cleanup DataTables.
- Event tombol memakai `.onclick` agar tidak menumpuk setelah pindah menu berulang kali.


## V10.11
- Inflasi Final memakai desain tabel native yang mengikuti Inflasi Asem.
- Header dua tingkat dan warna biru lembut.
- MtM/YtD/YoY serta angka di bawahnya dikunci center dengan colgroup.
- Toolbar Excel/CSV/PDF/Image + Search dibuat konsisten.
- PDF/Image mengambil tampilan web tabel Inflasi Final.


## V10.12
- Inflasi Final mempertahankan desain native elegan yang sama dengan Inflasi Asem.
- Pada Inflasi Final, setiap kolom MtM/YtD/YoY dibandingkan antarwilayah:
  - tertinggi = highlight merah,
  - terendah = highlight hijau.
- Pada Inflasi Asem vs Angka Final, aturan yang sama diterapkan terpisah untuk 6 kolom:
  - Final MtM/YtD/YoY,
  - Sementara MtM/YtD/YoY.
- Jika seluruh nilai dalam satu kolom sama, kolom tidak diberi highlight agar tidak seluruhnya berwarna.


## V10.14 — Download Semua Menu
- Tambah tombol **Download Semua Sementara** di dalam menu utama Angka Sementara.
- Tambah tombol **Download Semua Final** di dalam menu utama Angka Final Inflasi.
- Masing-masing tombol menghasilkan satu file Excel dengan **10 sheet**:
  - MtM - Inflasi
  - MtM - Andil
  - MtM - Komoditas
  - YtD - Inflasi
  - YtD - Andil
  - YtD - Komoditas
  - YoY - Inflasi
  - YoY - Andil
  - YoY - Komoditas
  - Inflasi Asem / Inflasi Final
- Jadi bila kedua tombol digunakan, akan diperoleh **2 file Excel terpisah**.
- Komoditas pada bulk export memakai mode **semua** (seluruh andil negatif dan positif), bukan hanya Top 10.
- Setiap sheet memuat metadata sumber, menu, tahun, bulan, flag, tanggal dan jam download.
- Backend memakai **request-local period memo** sehingga blok data tahun-bulan yang sama hanya dibaca sekali selama proses bulk export.
- Bulk export menggunakan satu request API per workbook, bukan 10 request browser terpisah.


## V10.15 — Highlight export sama dengan web
- Memperbaiki artefak kotak/strip pada highlight merah dan hijau di PDF/Image.
- Clone export memakai warna solid, border tipis, radius dan ukuran pill yang sama seperti web.
- Inset box-shadow dihilangkan hanya saat export karena dapat dirender tidak konsisten oleh html2canvas.
- Tampilan web tidak diubah.

## V10.17 — Menu Inflasi Diseragamkan
- Inflasi Asem dan Inflasi Final sekarang mengikuti persis gaya MtM/YtD/YoY.
- Font Plus Jakarta Sans, ukuran 13px, weight 700.
- Tinggi 43px, padding 9px 10px, radius 11px.
- Ikon, hover, active state, dan chevron kanan diseragamkan.
- Tidak mengubah logika data, API, download, atau Apps Script.


## V10.18 — Sticky Header & Header Wilayah
- Header tabel standar sekarang tetap terlihat ketika halaman di-scroll ke bawah.
- Berlaku pada menu Inflasi, Andil, MtM/YtD/YoY, dan tabel DataTables standar lain.
- Header dua tingkat pada Inflasi Asem vs Angka Final dan Inflasi Final juga sticky.
- Header tabel Komoditas Andil ikut sticky ketika isi tabel panjang.
- Kode wilayah 1902 / 1903 / 1906 / 1971 / 19 dibuat:
  - lebih besar,
  - lebih tebal,
  - warna putih,
  - background gradient biru,
  - nama kabupaten/kota lebih kontras.
- Sticky dinonaktifkan khusus pada clone PDF/Image supaya hasil export tetap normal.
- Tidak mengubah backend, API, login, data, filter, atau logika download.


## V10.19 — Sticky Header Fix
- V10.18 belum konsisten karena DataTables `scrollX` membuat header clone.
- V10.19 memakai JavaScript untuk membuat `.dataTables_scrollHead` fixed saat user scroll melewati bagian atas tabel.
- Header tetap terlihat sampai bagian bawah tabel.
- Berfungsi kembali setelah sort, search, pagination, dan perubahan jumlah baris.
- Header kode wilayah sekarang ditargetkan langsung pada clone yang benar-benar terlihat:
  - 1902 / 1903 / 1906 / 1971 / 19 lebih besar dan lebih tebal.
  - Background gradient biru.
  - Teks putih.
  - Nama kabupaten/kota biru muda-putih yang lebih kontras.
- `index.html` menggunakan `style.css?v=10.19` dan `script.js?v=10.19` agar cache GitHub Pages/browser tidak memakai file lama.


## V10.20 — Unified Table Header
- Header `Kode Komoditas` dan `Nama Komoditas` sekarang sama dengan header wilayah.
- Seluruh header memakai gradient biru yang sama.
- Teks putih dan font weight 900.
- Sorting icon putih.
- Border dan alignment diseragamkan.
- Sticky header V10.19 tetap dipertahankan.
- Hasil visual export PDF/Image mengikuti header baru.


## V10.21 — Clean Header
- Menghilangkan strip/baris warna tambahan tepat di bawah header tabel.
- Strip tersebut berasal dari `thead` asli di `.dataTables_scrollBody` milik DataTables `scrollX`.
- Header asli tidak dihapus (`display:none` tidak digunakan) agar sinkronisasi lebar kolom tetap aman.
- Visual header body dibuat tinggi 0, tanpa padding, border, background, teks, dan sorting icon.
- Header clone di `.dataTables_scrollHead` tetap memakai desain biru V10.20 dan sticky header V10.19.
- `style.css?v=10.21` dan `script.js?v=10.21` digunakan untuk menghindari cache frontend lama.


## V10.22 — Column Width Adjustment
- Kolom `Nama Komoditas` dipersempit agar tidak terlalu jauh dari kolom wilayah.
- Proporsi desktop:
  - Kode Komoditas 9%
  - Nama Komoditas 31%
  - masing-masing wilayah 12%
- Nama komoditas panjang otomatis wrap menjadi beberapa baris.
- Kolom wilayah dibuat sedikit lebih lega.
- Sticky header dan desain header biru tetap dipertahankan.
- PDF/Image visual export mengikuti proporsi kolom baru.
- Cache frontend dinaikkan menjadi `v=10.22`.


## V10.23 — Dashboard
- Menu `Dashboard` ditambahkan paling atas dan menjadi halaman pertama setelah login.
- Dashboard memakai endpoint ringkas `dashboardSeries`, jadi tabel besar tidak dimuat saat login.
- Dashboard menampilkan:
  - periode Final terbaru,
  - MtM terbaru,
  - YtD terbaru,
  - YoY terbaru,
  - perubahan MtM vs bulan sebelumnya,
  - MtM tertinggi/terendah tahun terpilih.
- Grafik series Angka Final: MtM, YtD, YoY per bulan.
- Filter grafik:
  - Tahun
  - Wilayah
- Download grafik:
  - Image (PNG)
  - PDF
  - Excel
- Grafik dibuat dengan SVG native tanpa menambah library chart baru agar loading tetap ringan.
- Backend series memanfaatkan `getHeadline_` dan cache periode yang sudah ada.
- `Code.gs` berubah dan harus di-deploy sebagai New version.
