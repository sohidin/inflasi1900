# Dashboard Inflasi 1900 — Versi 2

Versi ini disederhanakan menjadi hanya 5 file:

1. `Code.gs`
2. `README.md`
3. `index.html`
4. `script.js`
5. `style.css`

## Perbaikan versi ini

- Sidebar awal hanya menampilkan:
  - Angka Sementara
  - Angka Final Inflasi
- Submenu tampil saat menu utama diklik.
- MtM/YtD/YoY juga dibuat bertingkat agar sidebar tetap pendek.
- Tampilan dibuat lebih modern dan eye catching.
- Login tetap `harga1900 / harga1900`.
- Semua tabel tetap dapat sort, filter/search, Excel, CSV, PDF, Image.
- Menu komoditas tetap memiliki:
  - Top 10 tertinggi/terendah
  - Filter |andil| >= 0,01
- Informasi `Data sementara per` tetap editable.

## Optimasi loading

Versi sebelumnya membaca banyak kolom dari seluruh sheet final (>108 ribu baris).

Versi ini:
1. hanya membaca kolom A:B untuk mencari posisi blok tahun-bulan,
2. kemudian hanya membaca baris pada tahun-bulan tersebut,
3. hasil filter dan tabel di-cache sementara di Apps Script.

Karena itu request setelah pemilihan tahun-bulan seharusnya jauh lebih cepat.

## Cara pasang

### A. Apps Script

1. Buka project Apps Script yang terhubung dengan spreadsheet.
2. Ganti seluruh isi `Code.gs` dengan file `Code.gs` versi ini.
3. Pastikan timezone project `Asia/Jakarta`.
4. Deploy:
   - Deploy > Manage deployments
   - Edit deployment
   - Version: New version
   - Deploy
5. Salin URL `/exec`.

### B. Website GitHub

1. Buka `script.js`.
2. Ganti:

```js
API_URL: "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE"
```

dengan URL Web App Apps Script.

3. Upload 4 file web berikut ke root repository:
   - `index.html`
   - `script.js`
   - `style.css`
   - `README.md`

4. Aktifkan GitHub Pages dari branch `main`.

## Catatan

Jumlah file frontend tidak menentukan cepat-lambat pembacaan data secara signifikan. Penyebab utama adalah ukuran data yang dibaca dari Google Sheets dan jumlah pekerjaan di Apps Script.

File frontend yang lebih banyak hanya menambah beberapa request kecil. Setelah browser cache, pengaruhnya biasanya sangat kecil dibanding membaca puluhan/ratusan ribu baris spreadsheet.
