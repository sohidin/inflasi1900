# Dashboard Inflasi 1900

Website GitHub Pages + backend Google Apps Script untuk Spreadsheet:
`1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI`

## Fitur

- Login `harga1900 / harga1900`
- Angka Sementara
  - MtM: Inflasi, Andil, Komoditas Andil
  - YtD: Inflasi, Andil, Komoditas Andil
  - YoY: Inflasi, Andil, Komoditas Andil
  - Inflasi Asem
- Angka Final Inflasi
  - MtM: Inflasi, Andil, Komoditas Andil
  - YtD: Inflasi, Andil, Komoditas Andil
  - YoY: Inflasi, Andil, Komoditas Andil
  - Inflasi Final
- Filter Tahun, Bulan, Flag
- Filter Kode Kota pada menu Komoditas
- Top 10 tertinggi/terendah atau batas |andil| >= 0,01
- Sort, Search
- Download Excel, CSV, PDF, PNG
- Data per tanggal/bulan/tahun/jam khusus Angka Sementara dan dapat diedit

## 1. Pasang Backend Apps Script

1. Buka https://script.google.com
2. Buat project baru.
3. Hapus isi `Code.gs`.
4. Copy seluruh isi file `Code.gs` dari folder ini.
5. Pastikan Time zone project = Asia/Jakarta.
6. Klik **Deploy > New deployment**.
7. Pilih **Web app**.
8. Execute as: **Me**
9. Who has access: **Anyone**
10. Klik Deploy.
11. Salin URL Web App yang berakhiran `/exec`.

> Akun Google yang melakukan deploy harus memiliki akses ke spreadsheet.

## 2. Masukkan URL Web App

Buka:

`js/config.js`

Ganti:

```js
API_URL: "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE"
```

menjadi contoh:

```js
API_URL: "https://script.google.com/macros/s/AKfycbxxxxxxx/exec"
```

## 3. Upload ke GitHub

Upload ke repository:

- `index.html`
- `dashboard.html`
- folder `css`
- folder `js`
- folder `assets` bila nanti ingin menambahkan logo

## 4. Aktifkan GitHub Pages

Repository > Settings > Pages

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

Simpan.

GitHub kemudian memberikan URL website.

## Catatan performa

Sheet `angka final inflasi` lebih dari 100 ribu baris. Versi awal ini tetap membaca data server-side di Apps Script sehingga browser tidak menerima seluruh isi sheet. Jika nanti performa terasa lambat, tahap optimalisasi berikutnya adalah membuat sheet/helper cache atau indeks data per tahun-bulan.

## Catatan keamanan

Login pada website diproses melalui Apps Script, sehingga password tidak ditulis di JavaScript GitHub. Namun ini tetap autentikasi ringan, bukan sistem keamanan tingkat enterprise.

Untuk dashboard internal sederhana, mekanisme ini cukup praktis.
