// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/reelshort.js with the English upstream values from its php/sources/reelshort.php.
// Adapter ReelShort (narto-drama). Katalog Inggris ('en'; book_id berbeda per bahasa). Tanpa subtitle (hardsub).
// Stream: HLS di CDN dengan CORS terbuka, episode terkunci sudah dibuka oleh upstream.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'reelshort';
const LANG = 'en';
const q = { lang: LANG };

const tagsOf = (b) => b.theme?.length ? b.theme : (b.tag_list || []).map((t) => t.tag_name);

function card(b) {
  return {
    id: String(b.book_id),
    title: b.book_title,
    cover: b.book_pic,
    episodes: b.chapter_count || undefined,
    tags: tagsOf(b),
  };
}

const cards = (books) => (books || []).filter((b) => b.book_id && b.book_title).map(card);

export default {
  id: SOURCE,
  name: 'ReelShort',

  async home() {
    const [home, foryou] = await Promise.allSettled([
      upstream(SOURCE, '/get-home', { query: q }),
      upstream(SOURCE, '/get-foryou', { query: q }),
    ]);
    const sections = [];
    if (foryou.status === 'fulfilled') {
      sections.push({ title: 'Pilihan Untukmu', items: cards(foryou.value.lists) });
    }
    if (home.status === 'fulfilled') {
      const [featured, popular] = home.value.lists || [];
      if (featured) sections.push({ title: 'Sorotan', items: cards(featured.books) });
      if (popular) sections.push({ title: 'Populer', items: cards(popular.books) });
    }
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || foryou.reason || new UpstreamError('reelshort: beranda kosong');
    return { sections: out };
  },

  async search(query) {
    const d = await upstream(SOURCE, `/search/${encodeURIComponent(query)}`, { query: q });
    return { items: cards(d.lists) };
  },

  async detail(id) {
    const d = await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`, { query: q });
    // Episode 0 = trailer, dilewati.
    const episodes = (d.episodes || [])
      .filter((e) => e.serialNumber >= 1)
      .map((e) => ({ key: e.chapterId, number: e.serialNumber, title: e.chapterName }));
    return {
      id: String(d.book_id),
      title: d.book_title,
      cover: d.book_pic,
      description: d.special_desc || '',
      tags: tagsOf(d),
      totalEpisodes: episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await upstream(SOURCE, `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, {
      query: q,
      ttl: 60,
    });
    const clip = d.clips?.[0];
    // Utamakan H264 (H265 tidak diputar semua browser).
    const best = clip?.renditions?.find((r) => r.encode === 'H264' && r.playUrl);
    const url = best?.playUrl || clip?.playUrls?.[0];
    if (!url) throw new UpstreamError('reelshort: URL stream tidak ditemukan');
    return { url, type: 'hls', proxy: false };
  },
};
