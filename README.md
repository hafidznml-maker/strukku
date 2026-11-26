# StrukKu — Aplikasi Keuangan Mobile & Scan Struk AI

Aplikasi keuangan pribadi berbasis **Mobile-First PWA (Progressive Web App)** yang siap di-install di HP Android & iPhone, dilengkapi **Gemini AI Vision** untuk merekap pengeluaran otomatis hanya dengan memfoto struk belanja.

## Fitur Utama

1. **Scan Struk Otomatis (Gemini AI Vision)**
   - Foto struk langsung dari kamera HP atau pilih dari galeri.
   - AI otomatis membaca: Nama Toko, Tanggal & Jam, Daftar Item, Pajak/Diskon, Total Bayar akhir, Kategori, dan Metode Pembayaran (QRIS / Bank / Tunai).
   - Mendukung **2 mode AI**:
     - **Server Proxy AI (Tanpa API Key untuk pengguna)**: sudah siap pakai untuk Cloudflare Pages (`functions/api/scan.js`), Netlify (`netlify/functions/scan.js`), atau Cloudflare Worker (`server/cloudflare-worker.js`) lengkap dengan batas kuota harian & kode akses opsional.
     - **API Key Pribadi**: pengguna juga bisa memasukkan API Key Google AI Studio sendiri (100% disimpan lokal di perangkat).
   - Foto struk tersimpan lokal (IndexedDB) dan bisa dilihat ulang kapan saja di detail transaksi.
   - Dilengkapi **Mode Simulasi Scan** (Struk Alfamart, Fore Coffee, Apotek K-24) untuk mencoba alur scan tanpa koneksi AI.

2. **Ramah untuk Pengguna Baru & Mudah Di-install**
   - **Ikon PWA Lengkap** (`192×192`, `512×512`, `maskable`, dan `apple-touch-icon` `180×180`) agar prompt install Android/iPhone & PWABuilder berjalan mulus.
   - **Banner Install 1-Ketukan di Beranda** + modal panduan visual khusus iPhone Safari & Android Chrome.
   - **Layar Sambutan Pertama (Onboarding)** untuk memilih langsung mulai catatan kosong atau melihat data contoh.
   - **Tombol Bagikan Aplikasi** langsung ke WhatsApp / Web Share API.

3. **Catat Pemasukan, Pengeluaran & Transfer Cepat**
   - Input nominal Rupiah otomatis terformat + tombol cepat (`+25 rb`, `+50 rb`, `+100 rb`, `+500 rb`, `+1 jt`).
   - Multi-dompet (Tunai, Rekening Bank, E-Wallet/QRIS, Kartu Kredit) & Transfer antar dompet.

4. **Track Record, Analitik, Anggaran & Target Keuangan**
   - Filter berdasarkan bulan, tipe transaksi, dompet, maupun khusus hasil scan struk + pencarian hingga nama item.
   - Grafik Donut pengeluaran per kategori, Grafik Arus Kas 6 bulan, *Savings Rate*, Anggaran (Budgeting), Target Tabungan, & Tagihan Rutin.
   - Export **CSV (Excel)**, **Backup / Restore JSON**, **Mode Gelap**, & **Mode Privasi**.

---

## Cara Menjalankan di Komputer (Windows)

Tidak perlu install Node.js atau Python!
1. Klik dua kali file **`Jalankan-StrukKu.bat`**.
2. Browser akan otomatis membuka `http://localhost:8080`.

---

## Cara Menyebarkan ke Orang Lain (Online HTTPS, Tanpa API Key, & File APK)

Lihat panduan lengkap langkah-demi-langkah di file **[PANDUAN-DEPLOY-DAN-APK.md](./PANDUAN-DEPLOY-DAN-APK.md)**.
