// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/freereels.js with the English upstream values from its php/sources/freereels.php.
// Adapter FreeReels (white-label DramaWave). Katalog Inggris lewat lang=en-US; tab 503 (Populer) dan 505 (Baru) sama di
// semua bahasa, tab sulih suara Inggris = 514. Subtitle: semua trek (~25 bahasa) diteruskan. Stream: HLS fMP4 di video-v*.mydramawave.com tanpa CORS (playlist & segmen),
// jadi diputar lewat /proxy. Episode bertanda berbayar tetap terbuka (unlock:true dari upstream).

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'freereels';
const PREFIX = '/api';
const LANG = 'en-US';
const TABS = [['503', 'Pilihan Populer'], ['505', 'Baru'], ['514', 'Sulih Suara']]; // id tab dari /get-channels

const call = (path, opts = {}) => upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const card = (v) => ({
  id: String(v.key ?? v.id),
  title: String(v.title ?? v.name ?? '').trim(),
  cover: v.cover || '',
  episodes: v.episode_count || undefined,
  tags: (v.content_tags ?? []).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list ?? []).map(card).filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  id: SOURCE,
  name: 'FreeReels',

  async home() {
    const done = await Promise.allSettled(TABS.map(([tab]) => call('/get-channel-content', { query: { tab_key: tab } })));
    const sections = [];
    done.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      // module_name dari upstream kadang tetap berbahasa Inggris ("New"), jadi pakai label sendiri.
      const items = cards((r.value.data?.items ?? []).filter((m) => m.type !== 'banner').flatMap((m) => m.items ?? []));
      sections.push({ title: TABS[i][1], items });
    });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw done.find((r) => r.status === 'rejected')?.reason || new UpstreamError('freereels: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    // Upstream kadang membalas rate_limited:true dengan hasil kosong; jangan di-cache, coba ulang.
    for (let i = 0; i < 3; i++) {
      const d = await call('/search', { query: { q }, ttl: 0 });
      if (!d.rate_limited) return { items: cards(d.items) };
      await sleep(1500);
    }
    return { items: [] };
  },

  async detail(id) {
    const { data: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const episodes = (d.episodes ?? []).map((e) => ({
      key: String(e.id),
      number: e.index,
      title: `Episode ${e.index}`,
      locked: e.unlock === false,
    }));
    return {
      id: String(d.id ?? id),
      title: String(d.name ?? '').trim(),
      cover: d.cover || '',
      description: String(d.desc ?? '').trim(),
      tags: (d.content_tags ?? []).filter(Boolean),
      totalEpisodes: d.episode_count || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const { data: d } = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    const url = d.h264_m3u8 || d.h265_m3u8;
    if (!url) throw new UpstreamError('freereels: URL stream tidak ditemukan');
    const subtitles = (d.subtitles ?? [])
      .filter((x) => x?.language && (x.vtt || x.srt))
      .map((x) => ({ lang: x.language, url: x.vtt || x.srt }));
    return { url, type: 'hls', proxy: true, ...(subtitles.length && { subtitles }) };
  },
};
