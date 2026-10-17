// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/shortmax.js with the English upstream values from its php/sources/shortmax.php.
// Adapter ShortMax (narto-drama, prefix /api). Katalog Inggris ('en'; id berbeda per bahasa). Detail/stream mengikuti
// katalog id-nya (lang diabaikan).
// Stream: /get-stream/<id>?ep=N&proxy=1 memberi HLS yang sudah didekripsi lewat shortmax-stream.narto-drama.com
// (CORS terbuka, jadi proxy=false di sisi kita). Tanpa proxy=1 segmen terenkripsi ("shortmax..." header) dan
// CDN asli menolak request ber-Origin. Episode berbayar (lock=1) tetap terbuka karena upstream memakai token VIP.
// Item berbahasa Melayu (ms) dan berlabel "Erotika" dibuang.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'shortmax';
const PREFIX = '/api';
const LANG = 'en';
const MAX_PER_SECTION = 60;

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}️​-‍﻿]/gu, '').trim();

const ADULT = /erotik|erotic|dewasa|adult|18\+/i;

const labelsOf = (x) => (x.labelList || x.labelResponseList || []).map((l) => clean(l.labelName)).filter(Boolean);

// Bentuk home/ranking: { id, picUrl, ... }, bentuk pencarian: { shortPlayId, coverId, ... }
const card = (x) => {
  const tags = labelsOf(x);
  return {
    id: String(x.id ?? x.shortPlayId),
    title: clean(x.titleClean || x.shortPlayName),
    cover: x.picUrl || x.coverId,
    episodes: Number(x.totalEpisodes) || undefined,
    tags: (x.dubbed ? ['Dubbing', ...tags] : tags).slice(0, 4),
    _adult: tags.some((t) => ADULT.test(t)),
  };
};

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((x) => x.language !== 'ms')
    .map(card)
    .filter((c) => c.id && c.id !== 'undefined' && c.title && c.cover && !c._adult && !seen.has(c.id) && seen.add(c.id))
    .map(({ _adult, ...d }) => d)
    .slice(0, MAX_PER_SECTION);
};

// Satu halaman tab -> daftar section (banner biasa atau banner ranking dengan sub-daftar).
function sectionsOf(banners) {
  const out = [];
  for (const b of banners || []) {
    const title = clean(b.title) || 'Pilihan';
    if (b.shortPlayResponseList?.length) out.push({ title, items: cards(b.shortPlayResponseList) });
    for (const r of b.rankingResponseList || []) {
      out.push({ title: `${title} ${clean(r.rankingName)}`.trim(), items: cards(r.shortPlayResponseList) });
    }
  }
  return out;
}

// Upstream kadang membalas 500 sesaat untuk /get-stream; coba sekali lagi.
async function retry(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UpstreamError) return fn();
    throw e;
  }
}

export default {
  id: SOURCE,
  name: 'ShortMax',

  async home() {
    const [home, fresh] = await Promise.allSettled([call('/get-home'), call('/get-new')]);
    const sections = [];
    if (home.status === 'fulfilled') sections.push(...sectionsOf(home.value.data?.page?.bannerResponseList));
    if (fresh.status === 'fulfilled') sections.push(...sectionsOf(fresh.value.data?.bannerResponseList));
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || fresh.reason || new UpstreamError('shortmax: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = (await call(`/search/${encodeURIComponent(q)}`)).data;
    // Tanpa hasil cocok upstream mengembalikan daftar acak dengan fallback=true.
    if (!d || d.fallback || d.matched === false) return { items: [] };
    return { items: cards((d.shortPlays || []).filter((s) => s.matched !== false)) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    const d = info.data;
    if (!d) throw new UpstreamError('shortmax: drama tidak ditemukan', 404);
    const episodes = (eps.data || [])
      .filter((e) => e.episodeNum >= 1 && (e.videoType ?? 1) === 1)
      .sort((a, b) => a.episodeNum - b.episodeNum)
      .map((e) => ({ key: String(e.episodeNum), number: e.episodeNum, title: `Episode ${e.episodeNum}` }));
    return {
      id: String(d.shortPlayId ?? d.id),
      title: clean(d.titleClean || d.shortPlayName),
      cover: d.picUrl,
      description: String(d.summary ?? '').trim(),
      tags: labelsOf(d),
      totalEpisodes: episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await retry(() =>
      call(`/get-stream/${encodeURIComponent(id)}`, { query: { ep: key, proxy: 1 }, ttl: 60 }),
    );
    const q = d.data?.qualities || {};
    const url = q['720'] || q['1080'] || q['480'];
    if (!d.data?.found || !url) throw new UpstreamError('shortmax: stream tidak tersedia', 404);
    return { url, type: 'hls', proxy: false };
  },
};
