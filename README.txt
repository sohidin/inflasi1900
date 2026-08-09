DASHBOARD ANDIL INFLASI — DOWNLOAD PDF

Perubahan:
1. Tulisan tombol "Download Menu Ini" diperbaiki menjadi:
   "Download Excel Menu Ini".

2. Tombol "Download PDF" ditambahkan pada:
   - Komoditas Andil MtM
   - Komoditas Andil YtD
   - Komoditas Andil YoY
   - Rekap Inflasi

3. Setiap menu menghasilkan satu PDF:
   - Komoditas Andil MtM.pdf
   - Komoditas Andil YtD.pdf
   - Komoditas Andil YoY.pdf
   - Rekap Inflasi.pdf

4. Isi PDF sama dengan layout Download Image:
   - Komoditas tetap dua tabel per baris;
   - kode komoditas tidak ditampilkan pada image/PDF;
   - tabel web dan Excel tetap menampilkan kode komoditas;
   - Rekap Inflasi memakai tampilan yang sama dengan image rekap.

5. PDF otomatis dibagi menjadi beberapa halaman A4 portrait agar
   tulisan tetap terbaca dan tidak dipaksa menjadi satu halaman panjang.

6. Fitur Semua Flag, warna tertinggi/terendah per baris, search, sort,
   Excel, image, raw data, dan fitur lama tetap tersedia.

Cara memasang:
1. Ganti isi Code.gs, Index.html, Styles.html, dan Scripts.html.
2. Simpan seluruh file.
3. Deploy > Manage deployments > Edit > New version > Deploy.
4. Buka kembali Web App dan tekan Ctrl + F5.
5. Pastikan browser dapat memuat html2canvas dan jsPDF dari CDN.
