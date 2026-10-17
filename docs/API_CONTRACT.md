# Kontrak API internal — server ↔ app

Server: `server/` (Node, port `3030`, env `PORT`). App memanggil `http://<host>:3030/api/...`.
Semua respons JSON `Content-Type: application/json; charset=utf-8`, CORS `*`.
Error: HTTP 4xx/5xx dengan body `{ "error": string }`.

Semua URL media/gambar yang dikembalikan server **sudah absolut** dan siap diputar. URL lewat proxy mengarah ke server
itu sendiri (dibentuk dari header `Host` request, mis. `http://192.168.1.10:3030/api/proxy?...`). Stream `kd` yang CDN-nya
mengirim `Access-Control-Allow-Origin` dan tidak butuh Referer dikembalikan **langsung** (URL https CDN asli) supaya
video tidak lewat server; app tidak boleh menganggap `url`/`qualities[].url` selalu ber-origin server. Subtitle selalu
lewat proxy. Env server `PROXY_ALL=1` mengembalikan semuanya lewat proxy.

## Tipe

```ts
type SourceId = string; // "reelshort" | "dramabox" | "melolo" | "freereels" | "goodshort" | "idrama" | "dramawave" | ...

interface Drama {
  id: string;
  source: SourceId;
  title: string;
  cover: string;            // URL gambar poster vertikal (3:4 / 9:16)
  description: string;
  tags: string[];           // categoryNames / tag_list
  totalEpisodes: number;
  viewCount: number;        // 0 kalau tidak diketahui
  isCompleted: boolean;
  banner?: string;          // opsional: gambar banner lebar (landscape), saat ini hanya untuk item section "hero" dari ReelShort
  lang?: "id" | "en";       // bahasa konten item (lihat LANG_CONTRACT.md)
}

interface EpisodeRef { number: number; title: string; locked: boolean; thumb?: string }

interface DramaDetail extends Drama { episodes: EpisodeRef[] } // selalu terisi 1..totalEpisodes (generate kalau upstream null)

interface Quality { label: string; url: string }          // url via proxy atau langsung ke CDN, sama seperti EpisodePlay.url
interface Subtitle { label: string; language: string; url: string } // url via proxy

interface EpisodePlay {
  source: SourceId; id: string; number: number;
  locked: boolean;
  url: string;              // URL siap putar: /api/proxy, atau langsung ke CDN ber-CORS (https)
  type: "hls" | "mp4";
  codec?: "h264" | "hevc";  // opsional: codec video `url` kalau diketahui; "hevc" = Chromium/WebView tidak bisa memutar (app boleh menampilkan peringatan)
  qualities: Quality[];
  subtitles: Subtitle[];
}

interface Section {
  key: string;              // unik, mis. "reelshort:trending"
  title: string;            // judul bahasa Indonesia, mis. "Sedang Trending"
  style: "hero" | "rank" | "row" | "grid";
  items: Drama[];
}

interface Paged<T> { items: T[]; page: number; hasMore: boolean }
```

## Bahasa konten

Semua route `/api/*` kecuali `/api/proxy` dan `/api/health` menerima `lang=id|en` (default `id`). Detail lengkap
(akhiran id `~en`, `Drama.lang`, `langs` di `/api/sources`, format & urutan subtitle) ada di
[`LANG_CONTRACT.md`](LANG_CONTRACT.md). Ringkasnya:

- `Drama.lang?: "id" | "en"`; item katalog Inggris ber-id `<id>~en`. Pola id: `^[\w-]{1,64}(~(id|en))?$`.
- `/api/detail` & `/api/episode`: katalog hanya dari akhiran id (tanpa akhiran = Indonesia); `lang` hanya mengatur
  urutan subtitle episode.
- `/api/sources?lang=en` hanya berisi sumber berkonten Inggris; setiap item punya `langs`.
- `Subtitle.language` = ISO-639-1 huruf kecil, satu trek per bahasa, `url` selalu WebVTT lewat proxy,
  urutan: bahasa diminta, `en`, `id`, sisanya.

## Endpoint

| Method & path | Hasil |
|---|---|
| `GET /api/health` | `{ ok: true, sources: { [id]: "up" \| "down" \| "unknown" } }` |
| `GET /api/sources?lang=` | `{ items: { id, name, healthy: boolean, langs: ("id"\|"en")[] }[] }` |
| `GET /api/home` | `{ sections: Section[] }` — gabungan beberapa source sehat. Section pertama `style:"hero"` (5–8 item), lalu `rank` (Top 10), lalu beberapa `row`, terakhir `grid`. Section kosong dibuang. |
| `GET /api/list?source=&type=trending\|latest\|foryou&page=1` | `Paged<Drama>` |
| `GET /api/feed?page=1` | `Paged<Drama>` — campuran foryou lintas source untuk feed vertikal |
| `GET /api/search?q=&source=` | `{ items: Drama[] }` — tanpa `source` = cari paralel di beberapa source, hasil digabung & dedup |
| `GET /api/detail?source=&id=` | `DramaDetail` |
| `GET /api/episode?source=&id=&ep=` | `EpisodePlay` |
| `GET /api/proxy?url=<encoded>&sig=<hmac>` | stream media; hanya URL yang dibuat & ditandatangani server (dari `/api/episode`) yang diterima, selain itu `403`. m3u8 → segmen/URI di-rewrite lewat proxy ini; mp4 → teruskan `Range`/`206`. Header per host (Referer/Origin hanya untuk `anichin.bio`). |

## Perilaku wajib
- Upstream Anichin sering `520/502/500` & `{"error":"forbidden"}` → retry (maks 3, backoff 400ms→1.2s), timeout 8s per request, cache in-memory (list/home 5 mnt, detail 10 mnt, episode 90 dtk). Kalau gagal tapi ada cache basi → kembalikan cache basi.
- Source `reelshort` punya fallback scrape `www.reelshort.com` (Next.js data route, lihat `PRD.md` §3.3) untuk list/search/detail/episode bila Anichin gagal.
- `locked`: untuk `reelshort`, `/api/detail` selalu `locked:false` (episode berbayar tetap diputar lewat fallback website). Untuk `dramabox`/`shortmax`/`goodshort`, episode berbayar (`locked:true` + `videoUrl` kosong di upstream) di-resolve via endpoint `/hls` aggregator sehingga `/api/detail` juga selalu `locked:false` dan `/api/episode` mengembalikan url playable; bila resolver gagal (mis. goodshort tanpa seed episode gratis), respons tetap jujur: `locked:true` + url kosong. `freereels`/`netshort`/`flickreels`/`idrama`/`dramawave` tidak punya jalur unlock dan mempertahankan flag upstream. `/api/episode` selalu `locked:false` kalau `url` bisa diputar, apa pun flag upstream.
- Swap lintas source: untuk freereels/netshort/flickreels/idrama/dramawave, bila episode tidak bisa diputar di upstream-nya (paywall ep 6+), server mencari judul yang sama di dramabox/shortmax/goodshort/reelshort dan memutar episode dari sana; EpisodePlay.source/id tetap source/id asal agar rute app & riwayat valid, hanya url yang berasal dari source swap. Bila tidak ditemukan padanan, respons tetap jujur: locked:true + url kosong.
- Self-host DramaWave/FreeReels: sebelum swap, untuk `dramawave`/`freereels` server mencoba backend resmi (`api.mydramawave.com`, login anonim + `/h5-api/drama/info` + `/h5-api/drama/unlock_episode`). Episode yang masuk jendela gratis per-seri (indeks 1..N, N bervariasi) diputar langsung dari source asal (url/type/subtitles via proxy). Episode di luar jendela tetap berbayar di backend (`code:1000 Balance not enough`), jadi bila self-host tidak menghasilkan url, alur lanjut ke swap. Bila gagal total, respons tetap jujur: locked:true + url kosong.
- Codec: kalau upstream menawarkan beberapa varian (mis. Melolo `bytevc1` = HEVC), `url` default memilih varian H.264 (`avc1`) dan `qualities` diurutkan H.264 dulu, codec tak dikenal di tengah, HEVC terakhir. Kalau hanya ada HEVC, `url` tidak diubah dan `codec` = `"hevc"`. `codec` hanya diisi bila terdeteksi (field `codec` upstream, `CODECS=` pada master HLS, atau nama file seperti `.h264.mp4`).
- `/api/home` tidak boleh gagal total hanya karena satu source mati.
