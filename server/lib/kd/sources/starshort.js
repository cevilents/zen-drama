// StarShort (Narto Drama, prefix /api). Katalog terpisah per bahasa (id, en): fakeId dan id tab /get-list berbeda per
// bahasa. Detail/stream mengikuti katalog id-nya, jadi tetap lang=id (cache bersama).
// Stream: HLS di CDN ber-CORS (auth_key di query playlist), episode semua terbuka dari upstream.
// Id drama = compilationsFakeId (dipakai detail/episodes); stream butuh compilationsId + id episode,
// jadi key episode = "<compilationsId>:<episodeId>".

import { contentLang, langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'starshort';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };
const HOME_TABS = 3;
// id tab dari /get-home (lang=id): Sedang Tren, Baru Hari Ini, Drama Terbaik.
const TABS = [
  [1021, 'Sedang Tren'],
  [1261, 'Baru Hari Ini'],
  [887, 'Drama Terbaik'],
];

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });
const fixed = { lang: LANGS.id };

const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '').trim();

const card = (b) => ({
  id: b.fakeId || b.compilationsFakeId,
  title: strip(b.title),
  cover: b.coverImgUrl,
  episodes: Number(b.uploadOfEpisodes) || undefined,
  tags: (b.compilationsTags || b.tagList || []).slice(0, 4),
});

const cards = (list) => (list || []).map(card).filter((d) => d.id && d.title && d.cover);

// Bahasa selain Indonesia: tab pertama bagian beranda /get-home bahasa itu (nama sudah dilokalkan).
async function homeTabs() {
  if (contentLang() === 'id') return TABS;
  const d = await call('/get-home', { ttl: 21600 });
  const tabs = [];
  for (const sec of d.sections || []) {
    for (const t of sec.homeSectionTabDTOS || []) {
      const name = String(t.tabName ?? '').replace(/[\p{So}\p{Sk}\uFE0F\u200D]/gu, '').trim();
      if (!t.id || !name || name.toLowerCase() === 'banner') continue;
      tabs.push([Number(t.id), name]);
      if (tabs.length >= HOME_TABS) return tabs;
    }
  }
  return tabs;
}

export default {
  id: SOURCE,
  name: 'StarShort',

  async home() {
    const tabs = await homeTabs();
    const pages = await Promise.allSettled(tabs.map(([tab]) => call('/get-list', { query: { tab_id: tab } })));
    const sections = [];
    pages.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const items = cards(r.value.list);
      if (items.length) sections.push({ title: tabs[i][1], items });
    });
    if (!sections.length) {
      throw pages.find((r) => r.status === 'rejected')?.reason || new UpstreamError('starshort: beranda kosong');
    }
    return { sections };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.list) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([
      call(`/get-detail/${encodeURIComponent(id)}`, { query: fixed }),
      call(`/get-episodes/${encodeURIComponent(id)}`, { query: fixed }),
    ]);
    const d = info.data;
    // Judul episode dari upstream berbahasa Mandarin, jadi dibuat sendiri dari urutan.
    const episodes = (eps.episodes || []).map((e) => ({
      key: `${e.compilationsId}:${e.id}`,
      number: e.sequence + 1,
      title: `Episode ${e.sequence + 1}`,
      locked: e.lock || undefined,
    }));
    return {
      id: String(d.fakeId || id),
      title: strip(d.title),
      cover: d.coverImgUrl,
      description: strip(d.introduce),
      tags: d.compilationsTags || [],
      totalEpisodes: episodes.length || d.uploadOfEpisodes || 0,
      episodes,
    };
  },

  async stream(id, key) {
    const [comp, ep] = String(key).split(':');
    if (!comp || !ep) throw new UpstreamError('starshort: key episode tidak valid', 400);
    const d = await call(`/get-stream/${encodeURIComponent(comp)}/${encodeURIComponent(ep)}`, { query: fixed, ttl: 60 });
    if (!d.video_url) throw new UpstreamError('starshort: URL stream tidak ditemukan', 502);
    return { url: d.video_url, type: /\.mp4(\?|$)/i.test(d.video_url) ? 'mp4' : 'hls', proxy: false };
  },
};
