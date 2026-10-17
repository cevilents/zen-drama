// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/flickreels.js with the English upstream values from its php/sources/flickreels.php.
// FlickReels (Narto Drama). Bahasa konten lewat language_id: 1 = English (/get-lang). Channel beranda Inggris diambil
// dari /get-home-channels (dua pertama, styleType 1), cadangan 326/12 (Okt 2026). Detail terikat katalog playlet.
// Episode terkunci tetap terbuka lewat /get-stream (paywall di-bypass upstream).

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'flickreels';
const PREFIX = '/api';
const LANG = 1;
const NAV_FALLBACK = ['326', '12'];

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').trim();

const card = (p) => ({
  id: String(p.playlet_id),
  title: clean(p.title),
  cover: p.cover,
  episodes: Number(p.upload_num) || undefined,
  tags: (p.playlet_tag_name || p.tag_list?.map((t) => t.tag_name) || []).map(clean).filter(Boolean).slice(0, 4),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'FlickReels',
  async home() {
    const pages = await Promise.allSettled((await navIds()).map((n) => call(`/get-home/${n}`)));
    const sections = [];
    for (const r of pages) {
      if (r.status !== 'fulfilled') continue;
      for (const col of r.value.columns || []) {
        const items = uniq((col.list || []).map(card));
        if (items.length) sections.push({ title: colTitle(col.title), items });
      }
    }
    if (!sections.length) throw new UpstreamError('flickreels: home kosong', 502);
    return { sections };
  },
  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: uniq((d.data || []).map(card)) };
  },
  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    const d = info.detail;
    return {
      id: String(id),
      title: clean(d.title),
      cover: d.cover,
      description: clean(d.introduce?.introduce),
      tags: (d.introduce?.tag_list || []).map((t) => clean(t.tag_name)).filter(Boolean),
      totalEpisodes: d.totalEpisodes || eps.total || eps.episodes.length,
      episodes: (eps.episodes || []).map((e) => ({ key: String(e.episode), number: e.episode, title: `Episode ${e.episode}` })),
    };
  },
  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    // m3u8 asli (CDN) tanpa CORS & segmen relatif; m3u8_proxy dari upstream sudah ber-CORS.
    // Edge upstream kadang gagal mengambil m3u8 (403); cek dulu, bila gagal pakai CDN asli lewat proxy kita.
    if (d.m3u8_proxy && (!d.m3u8 || (await reachable(d.m3u8_proxy)))) {
      return { url: d.m3u8_proxy, type: 'hls', proxy: false };
    }
    if (d.m3u8) return { url: d.m3u8, type: 'hls', proxy: true };
    throw new UpstreamError('flickreels: stream tidak tersedia', 502);
  },
};

async function navIds() {
  try {
    const d = await call('/get-home-channels', { ttl: 21600 });
    const ids = (d.channels || [])
      .filter((c) => /^\d+$/.test(String(c?.channelId ?? '')) && (c.styleType ?? 1) === 1)
      .slice(0, 2)
      .map((c) => String(c.channelId));
    return ids.length ? ids : NAV_FALLBACK;
  } catch {
    return NAV_FALLBACK;
  }
}

// Nama internal beraksara Mandarin ("栏目", "轮播") di katalog Inggris diganti label generik.
function colTitle(t) {
  const title = clean(String(t ?? '').replace(/[\p{Extended_Pictographic}\ufe0f]/gu, ''));
  return !title || /\p{Script=Han}/u.test(title) ? 'Pilihan' : title;
}

async function readHead(r, bytes) {
  const reader = r.body?.getReader();
  if (!reader) return '';
  try {
    const { value } = await reader.read();
    return Buffer.from(value ?? []).subarray(0, bytes).toString('utf8').replace(/^\ufeff/, '');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Probes only the upstream's own edge (live: flickreels-stream.narto-drama.com) and never follows a redirect, so an
// upstream-supplied URL cannot point this server at another host. Anything else (non-ok, or a body that is not an HLS
// playlist) falls back to the CDN via our proxy.
async function reachable(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' || !hostname.endsWith('.narto-drama.com')) return false;
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      await r.body?.cancel();
      return false;
    }
    // A 200 can still be an error page: the playlist must start with #EXTM3U.
    const head = await readHead(r, 16);
    return head.startsWith('#EXTM3U');
  } catch {
    return false;
  }
}
