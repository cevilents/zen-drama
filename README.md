# ZEN DRAMA — aplikasi streaming drama pendek China

Aplikasi mobile (Expo / React Native) + server API kecil yang mengambil data dari agregator Anichin
dan situs ReelShort, lalu mem-proxy video supaya bisa diputar di HP.

```
dracin/
├── app/        aplikasi Expo (SDK 57) — layar ada di app/src/app/
├── server/     server API Node tanpa dependency (port 3030)
├── docs/       API_CONTRACT.md — kontrak server ↔ app
├── PRD.md      riset sumber data & video
└── reference/  adapter & skrip tes lama (referensi)
```

## Menjalankan

Butuh Node 20+ dan aplikasi **Expo Go** (versi terbaru, SDK 57) di HP. HP dan komputer harus satu Wi-Fi.

1. Jalankan server (terminal 1):

   ```bash
   cd server && npm start
   ```

2. Jalankan app (terminal 2):

   ```bash
   cd app && npx expo start --port 8082
   ```

3. Scan QR code dengan kamera (iPhone) atau Expo Go (Android).

App otomatis memakai alamat IP komputer + port 3030. Kalau muncul "Tidak bisa terhubung", buka
tab **Pengaturan**, ketuk logo ZEN DRAMA di bagian bawah 7x dengan cepat untuk membuka pengaturan
server yang tersembunyi, lalu isi manual, mis. `http://192.168.1.30:3030`. Preview di browser:
tekan `w` di terminal Expo.

## Deploy web

Web di-host di Cloudflare (Workers static assets) lewat akun bima.abiyasa16@gmail.com:
https://zen-drama.zen-drama.workers.dev

```bash
cd app && npx expo export --platform web && npx wrangler@4 deploy
```

Konfigurasinya di `app/wrangler.jsonc`. Setelah server punya alamat publik, build dengan
`EXPO_PUBLIC_API_URL=https://alamat-server npx expo export --platform web` supaya web tahu servernya.

## Fitur

- **Beranda** — carousel sorotan, Lanjutkan Menonton, Top 10, baris per kategori/sumber, genre, grid.
- **Untukmu** — feed vertikal ala TikTok, cuplikan EP 1 diputar otomatis.
- **Cari** — lintas 32 sumber, filter sumber, pencarian terakhir, kata kunci populer.
- **Detail** — sinopsis, daftar episode per rentang, lanjutkan dari episode terakhir.
- **Player** — geser atas/bawah ganti episode, ketuk 2x untuk maju/mundur 10 detik, tahan untuk 2x,
  scrubber, pilih kecepatan & kualitas, auto-next, simpan progres per episode.
- **Daftarku** — favorit & riwayat tonton (tersimpan di perangkat).
- **Pengaturan** — pemutaran, hapus data. Alamat server disembunyikan (ketuk logo di bawah 7x).

## Catatan

- Sumber pihak ketiga (Anichin) sering error 520/502. Server punya retry, cache, dan fallback ke
  situs ReelShort, jadi Beranda tetap terisi walau Anichin mati.
- Melolo dinonaktifkan karena videonya HEVC terenkripsi DRM dan tidak bisa diputar.
- Sebagian episode berbayar di DramaBox/GoodShort memang terkunci dari sumbernya.
- Konten berhak cipta milik masing-masing platform — untuk penggunaan pribadi/pembelajaran.
