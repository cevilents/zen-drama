# Kontrak bahasa konten & subtitle (server ↔ app)

Berlaku untuk server (`server/`) dan app (`app/`). Melengkapi `API_CONTRACT.md`.

## Bahasa konten

- Semua route `/api/*` kecuali `/api/proxy` dan `/api/health` menerima query `lang=id|en`.
  Default `id`; nilai lain diperlakukan `id`.
- `lang=id` = perilaku sekarang (32 sumber, termasuk sumber yang hanya berbahasa Inggris).
- `lang=en` = katalog bahasa Inggris. Hanya sumber yang punya konten Inggris yang ikut
  (home, feed, search, sources). Sumber tanpa konten Inggris tidak muncul.
- Cache server dipisah per bahasa.

## ID konten

- Item dari katalog non-default diberi akhiran bahasa: `<id>~en`.
  Item katalog Indonesia tetap `<id>` tanpa akhiran.
- Request dengan id berakhiran `~en` selalu memakai bahasa itu, apa pun nilai `lang`.
  Jadi favorit/riwayat dari mode Inggris tetap bisa dibuka di mode Indonesia.
- Sebaliknya, untuk `/api/detail` dan `/api/episode` id tanpa akhiran selalu berarti katalog
  Indonesia, walaupun `lang=en`. Bookmark dari mode Indonesia tetap jalan di mode Inggris.
  Untuk sumber ber-id bersama (metadata diterjemahkan, video sama), id tanpa akhiran tetap
  dibuka dengan metadata Indonesia.
- Pola id yang valid: `^[\w-]{1,64}(~(id|en))?$`. App memperlakukan id sebagai string opak
  (selalu `encodeURIComponent`).

## Bentuk data

- `Drama.lang?: "id" | "en"`: bahasa konten item.
- `/api/sources?lang=` → `{ items: [{ id, name, healthy, langs: ("id"|"en")[] }] }`.
- `EpisodePlay.subtitles: [{ label, language, url }]`
  - `language`: kode ISO-639-1 huruf kecil bila bisa (`id`, `en`, `zh`, `es`, …).
  - `url`: URL proxy yang selalu mengembalikan WebVTT (`text/vtt`).
  - Urutan: bahasa yang diminta dulu, lalu `en`, `id`, sisanya.
  - Daftar kosong berarti video tidak punya subtitle terpisah (biasanya sudah tertanam di video).

## App

- Pengaturan: `contentLang: "id" | "en"` (default `id`),
  `subtitleLang: "auto" | "id" | "en" | "off"` (default `auto` = ikut bahasa konten,
  lalu `en`, lalu `id`; kalau tidak ada yang cocok, subtitle tidak ditampilkan).
- Setiap request API mengirim `lang=<contentLang>`; query key React Query menyertakan bahasa.
- Player menampilkan subtitle WebVTT sebagai overlay (native & web), pilihan subtitle ada
  di sheet Pengaturan Pemutaran (Mati + tiap track yang tersedia).
- Teks UI tetap Bahasa Indonesia.
