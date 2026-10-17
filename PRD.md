# PRD — Aplikasi Dracin (Short Drama Streaming)

> Dokumen ini adalah **referensi sumber data & video** untuk membangun aplikasi dracin di sesi berikutnya.
> Semua endpoint di bawah **sudah diverifikasi langsung** (curl + test end-to-end) pada 9 Okt 2026.
> Disimpan di `~/Desktop/dracin/PRD.md`.

---

## 1. Ringkasan

Aplikasi streaming **drama pendek vertikal** (ReelShort / DramaBox / ShortMax / GoodShort / dll). Fokus PRD ini: **dari mana data drama + URL video didapat**, karena semua API pihak ketiga (termasuk `api.sansekai.my.id`) memblokir pemakaian gratis.

**Keputusan:** pakai **agregator Anichin (`miniapp.anichin.bio`)** sebagai sumber utama — gratis, tanpa API key, dan mengembalikan **URL video yang benar-benar bisa diputar** untuk 8+ platform.

---

## 2. Ruang Lingkup

- **In scope:** sumber data/video, kontrak endpoint, pipeline media (HLS), arsitektur proxy, model data, risiko.
- **Out of scope:** desain UI/UX detail, auth user, payment.

---

## 3. SUMBER DATA & VIDEO (CORE)

### 3.1 Sumber Utama — Anichin Aggregator API ✅ (GRATIS, TANPA KEY)

| Item | Nilai |
|---|---|
| Base URL | `https://miniapp.anichin.bio/api` |
| Auth | **Tidak perlu.** Kirim tanpa `api_key`. (Kalau mengirim `api_key` yang invalid → `401 {"error":"invalid or expired API key"}`; jadi **jangan kirim key sama sekali**.) |
| Docs | `https://miniapp.anichin.bio/docs` |
| Sumber tersedia | `dramabite, dramabox, dramaboxv2, dramanova, dramawave, flickreels, freereels, goodshort, idrama, melolo, netshort, playlet, popovibe, reelshort, shortmax, stardustv, starshort, wetv` |
| Jumlah source | 17 (hasil `GET /docs/visible-sources`) |
| Status sumber | Beberapa kadang `502` (mis. `dramanova`, `playlet` saat dites). Sisa normal. |

**Format endpoint:**
```
GET {base}/{source}/{endpoint}?id=&query=&ep=&page=
```

**Endpoint per source:**
`trending`, `latest`, `new`, `hot`, `hotrank`, `foryou`, `search`, `detail`, `episode`, `homepage`, `recommended`, `romance`, `drama18`

**Param:** `id` (dramaId), `query` (kata kunci), `ep` (nomor episode), `page`.

#### Skema respons (unified — sama untuk semua source)

**List** (`trending/latest/foryou/search/…`):
```json
{
  "code": 200,
  "hasMore": true,
  "items": [ /* Item */ ],
  "rows": [ /* sama seperti items */ ],
  "total": 97,
  "msg": "SUCCESS"
}
```

**Item** (satu drama — dipakai di semua list):
```json
{
  "id": "41000119443",
  "dramaId": "41000119443",
  "title": "Love That Survives the Hurt(DUBBED)",
  "cover": "https://thwztchapter.dramaboxdb.com/.../41000119443.jpg@w=240&h=400",
  "posterImg": "https://...",
  "description": "Seven years ago, ...",
  "synopsis": "...",
  "episodes": 92,              // JUMLAH episode (number), bukan array
  "totalEpisodes": 92,
  "categoryNames": ["Romance", "Drama"],
  "viewCount": 1250000,
  "likeCount": 0,
  "favoriteCount": 0,
  "isCompleted": "1",
  "defaultLanguage": "in",
  "publishedAt": ""
}
```

**Detail** (`{base}/{source}/detail?id=`):
```json
{
  "code": 200,
  "data": {
    /* ...field Item yang sama..., */
    "episodes": [        // ada untuk reelshort/shortmax/netshort/melolo/flickreels/freereels
      { "episodeNumber": 1, "number": 1, "episodeTitle": "Episode 1", "title": "Episode 1",
        "locked": false, "videoUrl": "" }   // videoUrl KOSONG di detail
    ]
    // null untuk dramabox & goodshort  → hitung episode via `episodes` di list, atau cari via search
  },
  "msg": "SUCCESS"
}
```

**Episode** (`{base}/{source}/episode?id=<dramaId>&ep=<n>`):
```json
{
  "code": 200,
  "episodeNumber": 1,
  "number": 1,
  "locked": false,
  "videoUrl": "<lihat tabel 3.2>",
  "qualityList": [ { "label": "720p", "url": "...", "isDefault": true } ],  // tidak semua source
  "subtitles": [ { "label": "Indonesia", "language": "id-ID", "url": "...vtt" } ] // sebagian source
}
```

#### Contoh curl (cepat)
```bash
B=https://miniapp.anichin.bio/api
curl -s "$B/dramabox/trending"
curl -s "$B/reelshort/search?query=love"
curl -s "$B/dramabox/detail?id=41000119443"
curl -s "$B/reelshort/episode?id=65df8281515dc2c2300535b9&ep=1"
curl -s "$B/docs/visible-sources"
```

---

### 3.2 Resolusi Media per-provider (PENTING ⚠️)

`videoUrl` tiap source **berbeda bentuk**. Ini kunci supaya video bisa diputar.

| Source | `videoUrl` dari `/episode` | Cara ambil media | Header khusus |
|---|---|---|---|
| **dramabox** | **direct MP4** `https://hwvideoseo.dramaboxdb.com/…720p.narrowv3.mp4` (+`qualityList` 540/720/1080) | pakai langsung | — |
| **reelshort** | **direct HLS** `https://v-mps.crazymaplestudios.com/…h264-….m3u8` (+`qualityList`) | pakai langsung | — |
| **netshort** | **direct CDN** `https://ns-aws-cdn.netshort.com/…?auth_key=…` | pakai langsung | — |
| **melolo** | **direct CDN** `https://v16-ml.melolostatic.com/…` (+`qualityList`) | pakai langsung | — |
| **freereels** | **direct CDN** `https://video-v6.mydramawave.com/…` (+`qualityList` + `subtitles`) | pakai langsung | — |
| **shortmax** | **relatif** `/api/shortmax/hls?id=…&ep=…&q=` | prefix `https://miniapp.anichin.bio` lalu GET | **Wajib** `Referer: https://miniapp.anichin.bio/` + `Origin: https://miniapp.anichin.bio` |
| **goodshort** | **relatif** `/api/goodshort/hls?bookId=…&chapterId=…&q=720p&lang=in` | prefix origin lalu GET | **Wajib** Referer + Origin |
| **flickreels** | **relatif** `/api/flickreels/hls?id=…&ep=…&ts=…&sig=…` | prefix origin → GET → dapat **JSON `{"url":"https://zshipricf.farsunpteltd.net/….m3u8?verify=…"}`** → GET url itu | Hop-1 **wajib** Referer/Origin; Hop-2 (CDN) **JANGAN** kirim Referer/Origin (kalau dikirim → 403) |

**Catatan penting:**
- `shortmax`/`goodshort` HLS → m3u8 berisi segmen **direct CDN** (mis. `akamai-static.shorttv.live`, `v3.goodshort.com`) yang **tidak butuh** Referer.
- `flickreels` m3u8 url punya `verify` bertanda tangan + **expired** → resolve fresh setiap kali.
- Untuk **semua** source, kalau diputar di **browser** lewat CDN langsung, bisa kena **CORS** → sebaiknya lewat **proxy server sendiri** (lihat §7).

---

### 3.3 Sumber Open-Source (untuk self-host / cadangan) ✅

Kalau mau **100% open-source tanpa ketergantungan pihak ketiga**, ini yang sudah diverifikasi:

**ReelShort — self-host scrape (TERVERIFIKASI JALAN)**
- Teknik: scrape Next.js data route `reelshort.com` (tanpa API pihak ketiga).
- Ambil `buildId` dari `https://www.reelshort.com/id` → regex `"buildId":"([^"]+)"`.
- Endpoint data (base `https://www.reelshort.com/_next/data/{buildId}/id`):
  - `search.json?keywords=<q>` → `pageProps.books[]` `{_id, book_title, book_pic, chapter_count}`
  - `movie/<slug>-<bookId>.json?slug=…` → `pageProps.data.online_base[]` `{serial_number, chapter_id}`
  - `episodes/episode-<n>-<slug>-<bookId>-<chapterId>.json?play_time=1&slug=…` → `pageProps.data.video_url` (HLS `.m3u8`)
- `slug = title.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim().replace(/ /g,'-')`
- Kode siap pakai (MIT): `wanglinsaputra/Rest-Api-ReelShort`, `AmmarrBN/reelshort-api`
- Hasil tes: search → 68 episode → `h264-narrow-hd.m3u8` → **HTTP 200**.

**DramaBox (library)**
- `zhadevv/dramabox` (npm `@zhadev/dramabox`, **MIT**) — API lengkap (getHomepage/getForYou/getChapters/getStreamUrl/dll). ⚠️ Saat dites **gagal** (WAF 403 saat generate token) → library perlu di-update; endpoint resmi `sapi.dramaboxdb.com` masih hidup.
- `hndko/dramabox-rest-api-node` (REST server, **tanpa LICENSE**) — self-contained token, tapi stream lewat pihak ketiga `regexd.com`.
- `dramabosid/DramabaBox-Api-Scraping` (Express, scrape `regexd.com`).

---

### 3.4 Sumber Hosted Lain (fallback; butuh key/berbayar)

| Nama | Base | Akses | Catatan |
|---|---|---|---|
| Hoshiyomi | `https://api.hoshiyomi.my.id/api/{platform}/{endpoint}` | Key gratis via Telegram `@dramaboxplusbot` (10/mnt, 500/hari, valid 1 hari) | Repo `beranalpa/dramabox-asia-api` MIT **tapi docs-only** (server tertutup) |
| DracinAPI / Anichin (resmi) | `https://miniapp.anichin.bio/api` + `X-API-Key: ANICHIN-xxxx` | Trial `TRIAL-ANICHIN-2026` sudah **expired**; berbayar | 42 provider |
| ApiKeun | `https://api.apikeun.com/v1/platforms/…` | Key berbayar | — |
| StreamAPI | `https://streamapi.web.id/p/<platform>/api/v1/…` | Berbayar | per-platform |

---

### 3.5 Sumber MATI (jangan dipakai) ❌

- `api.sansekai.my.id/api` → semua endpoint **403** `{"error":"Forbidden","message":"IP Anda telah diblacklist… beli source code…"}` (blok berbasis IP).
- `dramabox.sansekai.my.id`, `idflix.my.id` → down.
- **PineDrama** → `pinedrama.com` sudah pindah jadi situs **novel**, endpoint drama hilang.

---

## 4. Arsitektur yang Disarankan

```
Browser (Next.js/React) ──► Route Handler sendiri (/api/{source}/…)
                                   │
                                   ▼
                        Adapter/Resolver server
          ┌────────────────┬───────┴────────┬───────────────────┐
          ▼                ▼                ▼                   ▼
   Anichin (JSON)   Anichin (/hls, media)  ReelShort scrape   (opsional) fallback
```

**Prinsip:**
1. **Jangan fetch upstream langsung dari browser** (CORS + IP block + rahasia). Selalu lewat route handler **server-side**.
2. Terapkan **pola adapter**: satu lapisan yang memetakan endpoint internal → sumber eksternal, supaya sumber bisa diganti tanpa mengubah UI.
3. **Enkripsi respons** (opsional) antara route handler → klien, biar endpoint internal tidak gampang dibajak (SekaiDrama pakai AES + `NEXT_PUBLIC_CRYPTO_SECRET`).

**Referensi implementasi nyata:** `reference/adapter-sansekai-to-anichin.mjs` — adapter Node (tanpa dependency) yang menerjemahkan kontrak `sansekai` → Anichin dan **terbukti memutar video** untuk 8 provider. Pakai ini sebagai blueprint (hapus mapping ke sansekai, langsung expose endpoint internal sendiri).

---

## 5. Model Data (usulan)

```ts
interface Drama {
  id: string;            // = id/dramaId Anichin
  source: string;        // "dramabox" | "reelshort" | ...
  title: string;
  cover: string;
  description: string;
  categoryNames: string[];
  totalEpisodes: number;
  viewCount: number;
  isCompleted: boolean;
}

interface EpisodeRef { number: number; title: string; locked: boolean; }

interface EpisodePlay {
  number: number;
  locked: boolean;
  videoUrl: string;        // URL siap putar (sudah di-resolve/proxy)
  qualities?: { label: string; url: string }[];
  subtitles?: { language: string; url: string }[];
}
```

---

## 6. Spesifikasi Endpoint Internal (usulan API app kamu)

| Internal | Mapping Anichin |
|---|---|
| `GET /api/{source}/trending` | `/{source}/trending` |
| `GET /api/{source}/latest?page=` | `/{source}/latest?page=` |
| `GET /api/{source}/foryou?page=` | `/{source}/foryou?page=` |
| `GET /api/{source}/search?q=` | `/{source}/search?query=` |
| `GET /api/{source}/detail?id=` | `/{source}/detail?id=` |
| `GET /api/{source}/episode?id=&ep=` | `/{source}/episode?id=&ep=` → **resolve media** (§3.2) |
| `GET /api/media?s=&id=&ep=&q=` | resolver+proxy media (m3u8/mp4) — lihat adapter |
| `GET /api/proxy/video?url=` | proxy HLS/segmen (rewrite segmen + CORS) |

---

## 7. Pipeline Media (HLS) — wajib diperhatikan

1. **Proxy semua media lewat server sendiri** (`/api/proxy/video?url=…`):
   - hindari CORS,
   - sembunyikan URL asli,
   - rewrite segmen m3u8 → lewat proxy sendiri.
2. **m3u8 absolution:** baris segmen relatif harus di-absolutkan (`new URL(line, base)`) sebelum di-rewrite.
3. **Redirect handling:** CDN sering `301/302`; proxy harus mengikuti redirect.
4. **Referer per-hop:** hanya origin Anichin (`miniapp.anichin.bio`) yang butuh Referer/Origin; CDN menolak header itu (403). Pilih header berdasarkan host.
5. **HLS.js** di klien untuk `application/vnd.apple.mpegurl`; `<video>` native untuk MP4.
6. **Rate limit:** jangan spam. Anichin membalas `{"error":"forbidden"}` kalau kebanyakan request → beri jeda/retry.
7. **Cache:** list/detail boleh di-cache pendek (5 menit); episode/media jangan di-cache lama (m3u8 bisa expired).
8. **Subtitles:** sebagian source kasih `subtitles[]` (`.vtt`). Sajikan sebagai `<track>`.

---

## 8. Batasan, Risiko, Legal

- **Ketergantungan pihak ketiga:** `miniapp.anichin.bio` **tidak kamu kontrol**; bisa berubah/di-gate/berbayar kapan saja. Mitigasi: pola adapter + fallback (ReelShort self-host).
- **Stabilitas source:** tiap provider bisa berubah skema; bikin **health check** + fallback antar source.
- **Rate limit / IP block** (pelajaran dari sansekai): selalu lewat server sendiri, throttle, jangan expose endpoint publik tanpa proteksi.
- **Hak cipta:** konten ini berhak cipta. Untuk **penggunaan pribadi/pembelajaran**. Distribusi publik berisiko ToS/hukum. Pertimbangkan model legal (lisensi konten / provider resmi).

---

## 9. Roadmap MVP

1. **Fase 1 (data):** list (`trending/latest/foryou/search`) + detail untuk dramabox & reelshort.
2. **Fase 2 (play):** resolver media + proxy HLS untuk 2 source itu → video jalan.
3. **Fase 3 (luas):** tambah shortmax, goodshort, netshort, melolo, flickreels, freereels (perhatikan §3.2).
4. **Fase 4 (resiliensi):** fallback antar source, self-host ReelShort, cache, error handling.
5. **Fase 5 (produk):** auth, riwayat tonton, favorit, pencarian lintas-source.

---

## 10. Lampiran — Contoh Respons Mentah (hasil tes)

**dramabox — `/episode` (MP4 langsung):**
```json
{"code":200,"episodeNumber":1,"locked":false,"msg":"SUCCESS","number":1,
 "qualityList":[
  {"label":"540p","url":"https://hwztakavideoto.dramaboxdb.com/…/….540p.narrowv2.mp4"},
  {"isDefault":true,"label":"720p","url":"https://hwztakavideoto.dramaboxdb.com/…/….720p.narrowv3.mp4"},
  {"label":"1080p","url":"https://hwztakavideoto.dramaboxdb.com/…/….1080p.nav2.mp4"}],
 "videoUrl":"https://hwztakavideoto.dramaboxdb.com/…/….720p.narrowv3.mp4"}
```

**reelshort — `/episode` (HLS langsung):**
```json
{"code":200,"episodeNumber":1,"locked":false,"number":1,
 "qualityList":[
  {"label":"360p","url":"https://v-mps.crazymaplestudios.com/…/h264-ordinary-fd.m3u8"},
  {"isDefault":true,"label":"1080p","url":"https://v-mps.crazymaplestudios.com/…/h264-narrow-hd.m3u8"}],
 "videoUrl":"https://v-mps.crazymaplestudios.com/…/h264-narrow-hd.m3u8"}
```

**shortmax — `/episode` (HLS relatif → butuh Referer):**
```
videoUrl: "/api/shortmax/hls?id=46183&ep=1&q=720p"
→ GET https://miniapp.anichin.bio/api/shortmax/hls?id=46183&ep=1&q=720p
  (headers Referer+Origin: https://miniapp.anichin.bio)
→ #EXTM3U … https://akamai-static.shorttv.live/hls/…/segment-0.ts
```

**flickreels — `/episode` (2 hop):**
```
videoUrl: "/api/flickreels/hls?id=13128&ep=1&ts=…&sig=…"
→ GET (Referer+Origin) → {"url":"https://zshipricf.farsunpteltd.net/playlet-hls/….m3u8?verify=…"}
→ GET url (TANPA Referer) → #EXTM3U …
```

**Error rate-limit:** `{"error":"forbidden"}` (spasi request).

---

_Selesai. Dibuat dari riset & verifikasi langsung sesi SekaiDrama._
