// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/idrama.js with the English upstream values from its php/sources/idrama.php.
// Adapter iDrama. Katalog Inggris = lang 'en'; judul/sinopsis melekat pada id; subtitle SRT tidak bergantung lang. Episode "gratis" hanya 10 pertama menurut
// metadata, tapi /get-stream tetap mengembalikan URL HLS untuk semua episode.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'idrama';
const LANG = 'en';
const query = { lang: LANG };

const tagNames = (d) => [...(d.category_tag || []), ...(d.content_tag || [])].map((t) => t.tag_local).filter(Boolean);

const card = (d) => ({
  id: String(d.id),
  title: d.short_play_name,
  cover: d.cover_url || d.compress_cover_url,
  episodes: d.current_count,
  tags: tagNames(d).slice(0, 6),
});

export default {
  id: SOURCE,
  name: 'iDrama',
  async home() {
    const [home, trending, fresh] = await Promise.allSettled([
      upstream(SOURCE, '/get-home', { query }),
      upstream(SOURCE, '/get-channel/channel_f4904f0b', { query }),
      upstream(SOURCE, '/get-channel/channel_7e89a1a2', { query }),
    ]);
    const sections = [];
    if (home.status === 'fulfilled') {
      for (const s of home.value.data || []) sections.push({ title: s.name, items: (s.short_plays || []).map(card) });
    }
    if (trending.status === 'fulfilled') sections.push({ title: 'Sedang Tren', items: (trending.value.shortPlays || []).map(card) });
    if (fresh.status === 'fulfilled') sections.push({ title: 'Terbaru', items: (fresh.value.shortPlays || []).map(card) });
    return { sections: sections.filter((s) => s.items.length) };
  },
  async search(q) {
    const d = await upstream(SOURCE, `/search/${encodeURIComponent(q)}`, { query });
    return { items: (d.results || []).map(card) };
  },
  async detail(id) {
    // Panggilan dingin bisa 30-60 dtk.
    const d = await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`, { query, timeout: 50000 });
    return {
      id: String(d.id),
      title: d.short_play_name,
      cover: d.cover_url || d.compress_cover_url,
      description: (d.introduction || '').trim(),
      tags: tagNames(d),
      totalEpisodes: d.totalEpisodes || d.episodes.length,
      episodes: d.episodes.map((e) => ({ key: String(e.order), number: e.order, title: `Episode ${e.order}` })),
    };
  },
  async stream(id, key) {
    const d = await upstream(SOURCE, `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { query, ttl: 60, timeout: 50000 });
    const best = Object.values(d.streams || {})
      .filter((s) => s.playUrl && !s.isVip)
      .sort((a, b) => b.height - a.height)[0];
    if (!best) throw new UpstreamError(`${SOURCE}: stream tidak tersedia`, 404);
    const subtitles = (d.subtitles || []).filter((t) => t?.url && t.lang).map((t) => ({ lang: String(t.lang), url: t.url }));
    return { url: best.playUrl, type: 'hls', proxy: false, subtitles };
  },
};
