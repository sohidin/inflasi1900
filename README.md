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


## V10.24 — Interactive Dashboard & Comparison Series
- Titik grafik utama sekarang interaktif.
- Hover / klik titik menampilkan tooltip:
  - jenis data (MtM/YtD/YoY),
  - nilai,
  - bulan,
  - wilayah.
- Ditambahkan 3 grafik di bawah grafik utama:
  - Perbandingan MtM antar wilayah
  - Perbandingan YtD antar wilayah
  - Perbandingan YoY antar wilayah
- Setiap titik perbandingan menampilkan tooltip jenis data, nilai, periode, dan wilayah.
- Setiap grafik perbandingan dapat di-download sebagai:
  - Image
  - PDF
  - Excel
- Backend `dashboardSeries` sekarang mengembalikan seluruh series wilayah dalam satu request.
- Tidak ada request API terpisah untuk masing-masing grafik perbandingan.
- `Code.gs` harus di-deploy ulang sebagai New version.


## V10.25 — Performance
- Login Dashboard memakai `dashboardBootstrap`, tidak memuat filter metadata besar terlebih dahulu.
- Backend membaca satu tahun Angka Final dalam range gabungan, bukan per bulan.
- Wilayah dikirim sekaligus; ganti wilayah = render browser tanpa request API.
- Ganti tahun = satu request per tahun, lalu disimpan di `dashboardYearCache`.
- Kembali ke tahun yang pernah dibuka = instan.
- Filter UX:
  - Tahun = SEMUA GRAFIK.
  - Wilayah = GRAFIK UTAMA.
- Menu Sementara/Final diprefetch setelah Dashboard tampil.
- Updated-at tidak lagi memblokir perpindahan menu.
- Skeleton tabel ditunda 180 ms agar response cache tidak terasa berkedip.
- `Code.gs` berubah dan harus deploy New version.


## V10.26 — Strict Flag 0 + Faster Navigation
### Dashboard Flag
- Dashboard sekarang **WAJIB Flag = 0**.
- Kondisi fallback `commodityCode = 0` atau `UMUM` dihapus dari dashboard.

### Backend Dashboard
- Reader tahunan Dashboard membaca hanya `B:L` (11 kolom), bukan `A:O` (15 kolom).
- Tahun tetap dibaca dalam range gabungan sehingga akses Spreadsheet minimum.

### Filter Menu
- `getFilters_()` mengambil tahun/bulan dari period index yang sudah ada.
- Backend filter hanya membaca `C:D` dan `G`, bukan `A:D` dan `G`.
- Mengurangi volume sel cold-load filter.

### Cache Browser
- Dashboard bootstrap, Dashboard per tahun, dan filter sumber disimpan di `localStorage`.
- Saat halaman dibuka ulang, cache browser ditampilkan dulu (stale-while-revalidate), lalu data terbaru direfresh di background.
- Ganti wilayah tetap 100% client-side tanpa Apps Script.

### Prefetch
- Setelah Dashboard tampil, filter Sementara/Final diprefetch.
- Latest period kedua sumber di-warm-up di backend melalui `warmPeriod`.
- Pindah ke menu data terbaru lebih sering langsung mengenai period/pivot cache.

### Deployment
- `Code.gs` berubah dan wajib deploy **New version**.


## V10.27 — Dashboard Hotfix
- Memperbaiki bug V10.26: route `dashboardBootstrap` dan `dashboardYear`
  sudah ada, tetapi fungsi backend-nya tidak ikut masuk ke `Code.gs`.
- Fungsi berikut dipulihkan:
  - `dashboardYears_`
  - `getDashboardYearRows_`
  - `buildDashboardYearPayload_`
  - `getDashboardBootstrap_`
  - `getDashboardYear_`
- Dashboard tetap **STRICT Flag = 0**.
- Reader tahunan tetap hanya membaca `B:L`.
- Ganti wilayah tetap client-side tanpa request API.
- Cache browser dan optimasi navigasi V10.26 tetap dipertahankan.
- Error Dashboard sekarang menampilkan pesan backend yang lebih jelas.
- `Code.gs` wajib deploy ulang sebagai **New version**.


## V10.28 — Six Insight Cards
- Panel `Insight Tahun Terpilih` sekarang menampilkan 6 indikator:
  - MtM Tertinggi
  - MtM Terendah
  - YtD Tertinggi
  - YtD Terendah
  - YoY Tertinggi
  - YoY Terendah
- Masing-masing menampilkan nilai dan bulan/tahun.
- Layout dibuat 2 kolom × 3 baris agar lebih ringkas.
- Nilai tertinggi diberi aksen merah, nilai terendah diberi aksen hijau.
- Tetap berdasarkan Angka Final Flag 0, wilayah utama, dan tahun terpilih.
- Tidak ada perubahan backend/API.


## V10.29 — Typography Refresh
- Tipografi seluruh website diganti ke system UI font stack:
  - Segoe UI Variable / Segoe UI
  - system-ui
  - fallback Roboto / Helvetica / Arial
- Tidak menggunakan Google Fonts/external font request agar loading tidak bertambah.
- Sidebar:
  - menu utama lebih tegas,
  - MtM/YtD/YoY medium-bold,
  - submenu lebih ringan dan clean,
  - line-height diperbesar,
  - teks panjang lebih nyaman dibaca.
- Inflasi Asem/Final tetap seragam dengan MtM/YtD/YoY.
- Tabel:
  - isi tabel lebih ringan,
  - header tetap tegas,
  - angka memakai tabular numerals.
- Dashboard/KPI/Insight ikut menggunakan hierarchy typography yang lebih konsisten.
- Tidak ada perubahan backend atau logika data.


## V10.30 — Inflasi Asem & Inflasi Final = Flag 0
- KHUSUS menu `Inflasi Asem` dan `Inflasi Final`:
  - filter Flag tidak ditampilkan;
  - kartu Flag di ringkasan atas tidak ditampilkan;
  - backend `getHeadline_()` wajib membaca `Flag = 0`.
- Perbandingan Inflasi Asem vs Angka Final otomatis sama-sama memakai Flag 0.
- Menu lain TIDAK diubah:
  - Inflasi MtM/YtD/YoY
  - Andil MtM/YtD/YoY
  - Komoditas Andil
  - seluruh filter Flag pada menu tersebut tetap berfungsi.
- Dashboard tetap Flag 0.
- Paket ini memulihkan `Code.gs` lengkap agar seluruh endpoint tabel tetap tersedia.
- `Code.gs` berubah, jadi Apps Script harus deploy New version.


## V10.31 — Performance Optimization
- Menambahkan memory cache khusus response view/tabel.
- Request identik yang berjalan bersamaan digabung (in-flight deduplication).
- Cache view diperpanjang 15 menit.
- Cache browser Dashboard/filter diperpanjang 12 jam.
- Menu/table paling mungkin dipakai diprefetch setelah Dashboard selesai tampil.
- Loading skeleton baru muncul setelah 260 ms, sehingga cache-hit tidak berkedip.
- Jika view + filter sama persis dengan tampilan aktif, render ulang dihindari.
- Filter backend memakai request-level memo.
- Efek visual mahal (backdrop-filter/shadow besar) dikurangi tanpa mengubah desain utama.
- Aturan khusus Inflasi Asem/Inflasi Final tetap Flag 0.
- Menu lain dan filter Flag lain tidak diubah.
- `Code.gs` berubah, jadi deploy Apps Script New version.


## V10.32 — Dashboard Load Hotfix
- Memperbaiki kondisi `Gagal memuat` yang dapat terjadi saat Apps Script
  membaca terlalu banyak data untuk Dashboard.
- Reader Dashboard sekarang hanya membaca B:L (11 kolom), bukan A:O.
- Tetap strict `Flag = 0`.
- Segment tahun digabung supaya biasanya hanya 1 `getRange()` per tahun.
- Filter request-memo diperbaiki/dirapikan.
- Prefetch menu ditunda 650 ms setelah Dashboard tampil supaya tidak berebut
  resource dengan request pertama.
- Jika refresh backend gagal tetapi cache browser tersedia, Dashboard cache
  tetap ditampilkan.
- Menambahkan action `dashboardPing` untuk diagnosis deployment.
- Optimasi cache/menu V10.31 lainnya dipertahankan.
- `Code.gs` berubah dan wajib deploy New version.


## V10.33 — Stable Dashboard
- Dashboard backend custom reader diganti dengan builder yang menggunakan
  `getFilters_()` + `getHeadline_()` yang sama dengan menu normal.
- `getHeadline_()` tetap strict Flag 0.
- Payload Dashboard tetap dicache sebagai satu objek per tahun.
- Frontend memiliki **automatic fallback**:
  - bila `dashboardBootstrap` gagal,
  - aplikasi otomatis memakai endpoint `filters(final)` + `headline(final)`
    yang dipakai menu Inflasi Final.
- Fallback request bulan dijalankan paralel dan memakai cache view.
- Dashboard tidak lagi berhenti hanya karena endpoint Dashboard custom gagal.
- Pemilihan wilayah tetap client-side.
- `Code.gs` berubah dan harus deploy New version.


## V10.34 — Login Redesign + New Tab
- Dialog login diperbesar dan background dibuat lebih eye-catching.
- Badge login berubah menjadi `BPS1900`.
- Pesan login:
  - `Siap masuk ke dashboard`
  - `Membuka akses dashboard…`
  - `Akses diterima • dashboard siap dibuka`
  - error: `Akses belum berhasil • periksa akun lalu coba lagi`
- Token login disimpan ke localStorage selama 12 jam agar dapat dipakai lintas tab.
- Leaf menu dan Dashboard menjadi link (`<a href>`), sehingga browser menampilkan
  native `Open link in new tab` saat klik kanan.
- Klik kiri tetap menggunakan SPA tanpa reload.
- Tab baru membaca query `view/source/period` dan langsung membuka menu tersebut.
- Karena localStorage dibagi antar tab pada origin yang sama, tab baru tidak meminta login ulang.
- Logout menghapus sessionStorage dan localStorage token.
- Code.gs tidak berubah pada V10.34.


## V10.35 — Smart Prefetch + Status Cache
- Tidak menarik semua raw data pada login.
- Login langsung berpindah ke aplikasi; Dashboard dimuat asynchronous.
- Dashboard selesai -> prefetch Sementara lalu Final secara background dan berurutan.
- Hotset yang disiapkan: Inflasi MtM, YtD, YoY terbaru + headline Flag 0.
- Hover leaf menu selama ~140 ms memulai prefetch sebelum klik.
- Perubahan Tahun/Bulan/Flag menjadwalkan prefetch exact selection setelah 280 ms.
- Klik Terapkan/leaf menampilkan status Memuat -> Siap.
- Sidebar menampilkan status Dashboard/Sementara/Final dan badge SIAP ketika ketiganya siap.
- New-tab deep link tidak membuang waktu memuat Dashboard dulu.
- Backend tidak diubah; menggunakan cache/warmPeriod yang sudah ada pada V10.34.


## V10.36 — Refresh Data Web
- Tombol `Refresh Data Web` ditambahkan pada panel STATUS CACHE.
- Refresh memakai token login.
- Setiap refresh membuat `WEB_DATA_REVISION` baru.
- Semua cache key server menggunakan revision tersebut, sehingga cache lama otomatis diabaikan tanpa perlu menghapus satu per satu.
- Refresh membangun ulang:
  - filter Angka Sementara;
  - filter Angka Final;
  - headline Flag 0 terbaru;
  - Inflasi/Andil MtM, YtD, YoY terbaru;
  - Dashboard tahun terbaru.
- Status refresh disimpan di Script Properties dan ditampilkan di sidebar.
- Setelah refresh:
  - cache browser/data view dibersihkan;
  - Dashboard versi baru dimuat;
  - smart-prefetch berjalan kembali.
- Modal progress menunjukkan proses refresh dan durasi.
- Gunakan tombol ini setelah data spreadsheet selesai diperbarui.
- Code.gs berubah: wajib deploy Apps Script sebagai New version.


## V10.37 — Shared Server Cache Across Devices
### Tujuan
Satu akun dapat digunakan di beberapa laptop/HP tanpa setiap device menjalankan
prefetch berat yang sama.

### Cara kerja
1. Admin update spreadsheet.
2. Admin klik `Refresh Data Web` satu kali.
3. Apps Script membuat revision baru dan memanaskan CacheService.
4. `snapshotStatus` menyimpan `ready=true` + revision.
5. Device A/B/C saat login hanya mengecek status kecil tersebut.
6. Jika server cache = SIAP:
   - heavy smart-prefetch dilewati;
   - menu mengambil data dari shared Apps Script cache saat diperlukan.
7. Browser tetap punya memory/local cache sendiri sebagai lapisan tambahan.

### Revision
- Browser menyimpan `SERVER_REVISION_KEY`.
- Bila revision server berubah:
  - cache data browser lama dihapus;
  - token/login tidak dihapus;
  - revision baru disimpan.
- Device baru cukup menyimpan revision server yang aktif.

### Dampak
- Refresh cukup satu kali walaupun aplikasi dibuka dari device berbeda.
- Device baru tidak melakukan pemanasan ulang seluruh dataset.
- Beban Apps Script lebih kecil.
- Filter/menu tetap memakai existing memory cache setelah pertama dibuka.

### Deployment
- Code.gs berubah sedikit untuk metadata snapshot.
- Deploy Apps Script sebagai New version.
