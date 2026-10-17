# ZEN DRAMA server

API server for the ZEN DRAMA app. Zero dependencies, Node 20+ (tested on Node 26).

```bash
cd server
npm start              # or: PORT=3030 node index.mjs
```

It listens on `0.0.0.0:${PORT:-3030}` and prints the LAN URL on startup. Point the Expo app at that
address (e.g. `http://192.168.1.30:3030`), not `localhost`, because the phone is a different device.

Endpoints and response shapes: [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md); content language (`lang=id|en`,
`~en` ids, subtitles): [`../docs/LANG_CONTRACT.md`](../docs/LANG_CONTRACT.md).
Upstream sources and media rules: [`../PRD.md`](../PRD.md).

## How it works

| Module | Role |
|---|---|
| `index.mjs` | HTTP router, CORS, JSON errors, startup warm-up |
| `lib/catalog.mjs` | home / feed / list / search / detail / episode, fallbacks between sources |
| `lib/anichin.mjs` | Anichin aggregator client (concurrency 3, retry 400ms → 1.2s, 8s timeout, cache) |
| `lib/reelshort-web.mjs` | ReelShort scrape via Next.js data routes (`buildId`, shelves, search, movie, episode) |
| `lib/narto.mjs` | generic Narto Drama client (schema-walking) for vyntage, happyshort, dramanova, pinedrama, netshort, idrama, goodshort, flickreels |
| `lib/kd.mjs` | bridge to the per-provider adapters in `lib/kd/sources/` (19 registered sources, health channel `kd:<id>`) |
| `lib/kd/` | adapters ported from NANDA DRACIN (`sources/*.js`, made language-aware, see below) plus the `lib/upstream.js` shim they import; `sources/en/` holds English-only ports of the sources the Indonesian mode serves elsewhere |
| `lib/lang.mjs` | `lang` parsing, `~en` id suffix, language-code canonicalization and the shared subtitle list (dedupe, order, proxy) |
| `lib/proxy.mjs` | `/api/proxy` (HLS rewrite, Range streaming, JSON indirection) |
| `lib/normalize.mjs` | upstream item → contract `Drama` / `DramaDetail` |
| `lib/cache.mjs` | in-memory TTL cache with request de-duplication and stale fallback |
| `lib/sources.mjs` | source registry (`langs` per source) and health tracking |

- Cache: lists 5 min, detail 10 min, episode 90 s. Lists and detail are served stale while refreshing;
  any expired entry is returned if the upstream call fails.
- Health: every upstream call updates its source. Two consecutive failures mark it `down`; down sources are
  skipped when composing `/api/home`, `/api/feed` and source-less `/api/search`. All sources are re-probed
  every 10 minutes.
- `reelshort` uses Anichin first and falls back to the ReelShort website, which also powers the
  hero banners, the Top 10 and several home rows, so the app still has content when Anichin is down.
- Episodes: `locked` is `false` whenever a playable url is returned, and ReelShort details never list locked episodes.
  When an upstream lists several variants, H.264 is preferred for the default `url` and sorted first (Chromium cannot
  decode HEVC); `codec` is set on the response when known.
- Media and subtitle URLs are absolute. Subtitles and most streams go through `http://<Host header>/api/proxy?url=…`.
  `kd` streams whose adapter returns `proxy: false` (the CDN sends `Access-Control-Allow-Origin`) without a `referer`
  are returned as the upstream https url, so the video bytes never pass through this server (and its tunnel);
  `FORCE_PROXY` in `lib/kd.mjs` keeps a few of those proxied (en:vyntage: CloudFront drops the CORS header on cached
  segments; reelala: its CDN answers 403 to requests with a browser Referer). `PROXY_ALL=1` (or `true`/`yes`, case-insensitive) restores proxying everything. Anichin, Narto, ReelShort-web, DramaWave-web and
  unlock streams are always proxied.
- `kd` sources (bibishort, moboreels, cubetv, playlet, reelala, joyreels, reelbuzz, starshort, velolo, sarostv,
  reelife, microdrama, mydrama, flextv, vigloo, candyjar, myrelle, shortical, anyreel): `list` maps the provider's
  home sections (trending = 1st, latest = 2nd, foryou = 3rd or the whole catalog) in pages of 20; they get a
  "Populer di …" home row when they have 6+ items (first 8 healthy), join source-less search (first 6 healthy)
  and the feed (first 4 healthy). Cache: home/search 5 min, detail 10 min, episode 75 s. Upstream calls time out
  after 11 s (queue time included) and user-facing kd routes answer within 25 s. Health (`kd:<id>`) only counts
  failed home loads and transport errors (timeouts, network, gateway 5xx), never one bad title. An episode the
  provider will not serve is returned as `locked: true` with an empty `url`. SRT subtitles are converted to WebVTT by the proxy.
  `kalostv` has an adapter but is not registered (upstream down). Live check: `BASE=http://localhost:3030 node test-kd.mjs [source ...]` (direct urls are fetched with
  `Origin: http://localhost:8082` and must pass CORS on the playlist, first variant, key/map and first segment; MP4 must answer Range).

## Content language

Contract: [`../docs/LANG_CONTRACT.md`](../docs/LANG_CONTRACT.md). `lang=id` (default) is unchanged: 32 sources, same routing
as before. `lang=en` serves the 27 sources with `"en"` in `langs` (`lib/sources.mjs`), all through `kd.mjs`:

- kd sources with an English catalog read the language through the shim (`withLang` / `langValue` in
  `lib/kd/lib/upstream.js`). Changes from the NANDA Node files (ported from its PHP `langMap`, id/en only):
  `const LANG` became a `{ id, en }` map in bibishort, cubetv, playlet, reelala, starshort, sarostv, velolo, mydrama,
  shortical, moboreels, joyreels, flextv; vigloo sends `lang=en` only in English mode (no lang = Indonesian, as before).
  English home ids are looked up live: joyreels `/get-channels`, starshort `/get-home` tabs, flextv `/get-classify`
  (fallback 347/348). Catalog-bound detail/stream calls keep the Indonesian value so their URLs and caches are
  unchanged (playlet/reelala/starshort/sarostv stream, reelala/starshort/sarostv detail). velolo retries a 404 in
  `id`; such a title keeps its `~en` id but is labelled `lang: "id"` (the adapter reports the catalog it used).
  joyreels falls back to English channels 28/10/46 when `/get-channels` fails. moboreels takes the subtitle language
  from the original subtitle filename (`1-EN_….srtx`), then the VTT url's numeric `lang` (11 = id, 3 = en).
  Subtitles are no longer filtered to id/en (cubetv, vigloo, mydrama pass every track); kd.mjs normalizes them.
  mydrama plays `video_urls_by_lang[lang]` or else `video_url`: the sampled titles have no `id` key (only
  en/uk/de/es/fr/pt), so Indonesian mode plays `video_url` (original English audio) with Indonesian subtitles.
  `video_url` and `video_urls_by_lang.en` are both English: identical on 2 of 5 sampled titles, on the others two
  encodes of the same video (same duration, h264 720x1280, same frame, no burned-in text).
- Indonesian-only (excluded with `lang=en`): reelbuzz, reelife, microdrama, pinedrama, dramanova (its upstream answers
  `lang=en` with a Russian catalog). English-only sources (candyjar, myrelle, anyreel, vyntage) appear in both modes.
- reelshort, dramabox, freereels, goodshort, idrama, dramawave, shortmax, netshort, flickreels, vyntage, happyshort:
  `lib/kd/sources/en/*.js`, English ports of NANDA's Node adapters (values from its PHP versions; goodshort uses
  channel -1 pages 1-2, flickreels discovers its home channels, fallback 326/12, and only probes its `m3u8_proxy` on
  `*.narto-drama.com` without following redirects, otherwise it plays the CDN playlist through `/api/proxy`).
  No unlock or cross-source swap.
- Ids: English items are `<id>~en` and carry `lang: "en"`; every other item carries its source's language.
  `/api/detail` and `/api/episode` take the catalog only from the suffix (bare id = Indonesian, even with `lang=en`);
  there `lang` only orders subtitles.
- Upstream queues are per language too (lanes `home:<lang>`, `search:<lang>`), and warm-up loads the English catalogs
  only after the Indonesian batch settles, so English loads never push Indonesian ones past their deadline.
- Cache keys include the language (`kd:home:<lang>:<source>`, …); health for the English catalog is the `en:<id>`
  channel, which drives `/api/sources?lang=en` and the English home/feed/search fan-out (rows from up to 12 sources,
  feed from the first 6, search the first 10). Warm-up loads both languages.
- Subtitles (all sources): language normalized to lowercase ISO-639-1 (ind/in → id, eng → en, zh-Hans/zho → zh,
  pt-BR → pt, fil → tl, native/English names such as "Español" → es), one track per language (first wins), a track
  with no recognizable language kept as `und` ("Lainnya"), label kept unless it is only a code, url proxied
  (WebVTT), order: requested `lang`, en, id, rest.
- Live check: `BASE=http://localhost:3030 node test-lang.mjs [source ...]` (English chain for every English source,
  `~en` opened with `lang=id`, bare id with `lang=en`, Indonesian spot checks for reelshort/dramabox/goodshort).

## Environment

| Variable | Default | |
|---|---|---|
| `PORT` | `3030` | listen port |
| `HOST` | `0.0.0.0` | listen address. Behind a Cloudflare Tunnel use `127.0.0.1` so only `cloudflared` can reach it |
| `PROXY_ALL` | unset | `1`, `true` or `yes` sends every stream through `/api/proxy` again, including the CORS-enabled `kd` CDNs that are otherwise played directly (logged at startup) |
| `PROXY_SECRET` | random per start | HMAC key for `/api/proxy` URL signatures. Unset: URLs signed before a restart stop working (the app re-requests episodes). Set it to keep them valid across restarts |
| `RATE_LIMIT_MEDIA` | `1200` | requests/minute per client for `/api/proxy` |
| `RATE_LIMIT_API` | `120` | requests/minute per client for all other `/api/*` (`/api/health` is unlimited) |

## Public exposure

- `/api/proxy` only serves URLs signed by this server (`&sig=…`, HMAC-SHA256); unsigned or tampered requests get `403`.
  There is no open image relay; the app loads posters straight from their CDNs.
- Rate limit: fixed 60 s window per client. Requests from loopback (the local `cloudflared`) are keyed by
  `cf-connecting-ip`, then the first `x-forwarded-for` entry; everything else by the socket address, so those headers
  cannot be spoofed from the LAN. Over the limit → `429` with `Retry-After`.
