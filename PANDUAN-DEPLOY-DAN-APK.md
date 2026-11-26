# Panduan Deploy Online, Aktivasi AI Tanpa API Key, & Bikin File APK — StrukKu

Panduan ini menjelaskan cara mempublikasikan **StrukKu** agar orang lain (teman, keluarga, atau pengguna umum) cukup membuka **1 link** atau install **`.apk`**, dan langsung bisa pakai fitur **Scan Struk AI** tanpa perlu membuat API Key sendiri.

---

## Ringkasan 3 Pilihan Distribusi

| Jalur | Biaya | Pengguna Perlu Isi API Key? | Bentuk Install | Cocok Untuk |
| :--- | :--- | :--- | :--- | :--- |
| **1. Cloudflare Pages** *(Rekomendasi)* | Gratis | **Tidak perlu** (otomatis pakai server proxy `functions/api/scan.js`) | Link HTTPS + 1-tap Install PWA di HP | Sebar ke keluarga, teman, atau publik |
| **2. Netlify** | Gratis | **Tidak perlu** (otomatis pakai `netlify/functions/scan.js`) | Link HTTPS + 1-tap Install PWA di HP | Alternatif Cloudflare Pages |
| **3. PWABuilder → `.apk`** | Gratis | **Tidak perlu** (mengambil dari URL jalur #1 atau #2) | File **`.apk` Android** / `.aab` Play Store | Kirim file `.apk` lewat WA atau upload ke Play Store |

---

## Jalur 1: Deploy ke Cloudflare Pages (Paling Direkomendasikan)

Di folder `strukku` sudah disiapkan file **`functions/api/scan.js`**. Saat di-deploy ke Cloudflare Pages, endpoint `/api/scan` langsung aktif otomatis!

### Langkah 1 — Upload folder `strukku` ke GitHub
1. Buat akun gratis di [github.com](https://github.com) lalu klik **New Repository** (misal nama: `strukku`, boleh *Private* atau *Public*).
2. Upload seluruh isi folder `strukku` ke repository tersebut (pastikan `index.html`, `manifest.json`, `functions/`, `js/`, `css/`, `icons/` berada di root repo).

### Langkah 2 — Hubungkan ke Cloudflare Pages
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) (daftar gratis).
2. Di menu kiri, pilih **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git**.
3. Pilih repository `strukku` yang baru dibuat.
4. Pada pengaturan build:
   - **Framework preset**: `None`
   - **Build command**: *(kosongkan)*
   - **Build output directory**: `/` *(atau kosongkan)*
5. Klik **Save and Deploy**. Dalam ±30 detik kamu akan mendapat link HTTPS seperti `https://strukku.pages.dev`.

### Langkah 3 — Aktifkan AI Scan Tanpa API Key (Cukup 1x Setting)
1. Buat API Key gratis di [Google AI Studio](https://aistudio.google.com/apikey).
2. Di Cloudflare Pages, buka proyek `strukku` → **Settings** → **Variables and Secrets** → klik **Add** (pilih untuk **Production**):
   - **`GEMINI_API_KEY`** *(Wajib, pilih tipe **Secret**)*: tempel API Key dari Google AI Studio.
   - **`DAILY_LIMIT`** *(Opsional)*: batas scan gratis per pengguna per hari, misalnya `15` (default `15`).
   - **`ACCESS_CODE`** *(Opsional)*: isi kode rahasia (misalnya `keluarga2026`) **jika** kamu ingin membatasi fitur Scan AI hanya untuk orang yang tahu kodenya. Kosongkan jika bebas untuk semua orang.
3. Buka tab **Deployments** → klik **Retry deployment** pada deploy terakhir agar variabel baru aktif.

### Langkah 4 — Cek Hasilnya
- Buka `https://<nama-proyek>.pages.dev/api/scan` di browser.
- Jika muncul `{"ok":true,"mode":"proxy","configured":true,...}`, artinya **berhasil!**
- Buka link utama aplikasimu di HP: banner API Key otomatis hilang dan siapa pun bisa langsung foto struk!

---

## Jalur 2: Deploy ke Netlify (Alternatif)

Folder `strukku` sudah dilengkapi **`netlify.toml`** dan **`netlify/functions/scan.js`**.

1. Upload folder `strukku` ke GitHub (sama seperti Langkah 1 di atas).
2. Buka [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project** → pilih repo `strukku`.
3. Biarkan **Build command** kosong dan **Publish directory** `.` → klik **Deploy site**.
4. Masuk ke **Site configuration** → **Environment variables** → tambahkan:
   - `GEMINI_API_KEY` = API Key Google AI Studio kamu.
   - `DAILY_LIMIT` = `15` *(opsional)*
   - `ACCESS_CODE` = *(opsional)*
5. Di tab **Deploys**, klik **Trigger deploy** → **Deploy site**.

> **Catatan tentang Netlify Drop (drag & drop manual):**
> Netlify Drop hanya menghosting file statis (tidak menjalankan `netlify/functions/`). Jika ingin memakai Netlify Drop tapi tetap tanpa API Key di sisi user, deploy file **`server/cloudflare-worker.js`** ke Cloudflare Workers (lihat komentar di bagian atas file tersebut), lalu masukkan URL Worker ke **`js/config.js`** pada bagian `defaultProxyUrl` sebelum drag & drop!

---

## Jalur 3: Cara Bikin File `.apk` Android (via PWABuilder)

Setelah aplikasimu online di Jalur 1 atau Jalur 2 (memiliki link HTTPS):

1. Buka **[pwabuilder.com](https://www.pwabuilder.com/)**.
2. Masukkan URL aplikasimu (contoh: `https://strukku.pages.dev`) lalu klik **Start**.
3. PWABuilder akan otomatis memverifikasi `manifest.json`, ikon PNG `192×192` & `512×512` (termasuk maskable), dan Service Worker `sw.js` yang sudah kita siapkan.
4. Klik **Package for Stores** → pilih **Android** → **Generate Package**.
5. Klik **Download Package** — kamu akan mendapat file `.zip` berisi:
   - File **`.apk`** (bisa langsung dikirim lewat WhatsApp/Telegram untuk di-install di HP Android).
   - File **`.aab`** (siap di-upload ke Google Play Console jika ingin rilis di Play Store).
   - File `assetlinks.json` (kalau ingin tampilan 100% tanpa address bar browser saat dibuka dari APK, taruh file ini di folder `.well-known/assetlinks.json` lalu deploy ulang).

---

## Cara Membagikan ke Teman / Keluarga

Setelah punya link HTTPS:
1. Ketuk tombol **Bagikan** (ikon Share di pojok kanan atas aplikasi) → langsung kirim lewat WhatsApp atau salin link.
2. Kamu juga bisa ubah link HTTPS tersebut menjadi **QR Code** (lewat situs pembuat QR gratis) untuk di-scan dari HP lain.
3. Saat teman/keluarga membuka link pertama kali:
   - Akan muncul **layar sambutan** (bisa pilih langsung *Mulai Catatan Baru* atau *Lihat Data Contoh*).
   - Di Beranda muncul **banner "Pasang StrukKu di Layar Utama"** lengkap dengan tombol 1-ketukan (Android) dan panduan visual (iPhone Safari).
