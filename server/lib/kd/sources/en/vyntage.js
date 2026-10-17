// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/vyntage.js with the English upstream values from its php/sources/vyntage.php.
import { upstream } from '../../lib/upstream.js';

const SOURCE = 'vyntage';

const card = (d) => ({
  id: String(d.short_play_id ?? d.id),
  title: String(d.name ?? '').replace(/\s+/g, ' ').trim(),
  cover: d.image_url || d.horizontally_img || '',
  episodes: d.episode_total || undefined,
  tags: d.category || [],
});

const toSection = (title, list) => ({ title, items: dedupe((list || []).map(card)) });

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => i.id && i.title && !seen.has(i.id) && seen.add(i.id));
}

// Konten Vyntage hanya tersedia dalam bahasa Inggris; param lang diabaikan upstream (katalog sama dengan mode id).
export default {
  id: SOURCE,
  name: 'Vyntage',
  async home() {
    const calls = await Promise.allSettled([
      upstream(SOURCE, '/get-home'),
      upstream(SOURCE, '/get-hot'),
      upstream(SOURCE, '/get-list'),
    ]);
    const [home, hot, list] = calls.map((c) => (c.status === 'fulfilled' ? c.value.data : null));
    const mod = (key) => home?.list?.find((m) => m.module_key === key)?.data;
    const sections = [
      toSection('Rekomendasi', mod('home_v3_recommand')?.list),
      toSection('Peringkat Mingguan', mod('week_ranking')),
      toSection('Populer', hot?.list),
      toSection('Terbaru', list?.list?.slice(0, 24)),
    ].filter((s) => s.items.length);
    return { sections };
  },
  async search(q) {
    const d = await upstream(SOURCE, `/search/${encodeURIComponent(q)}`);
    return { items: dedupe((d.data?.list || []).map(card)) };
  },
  async detail(id) {
    const d = (await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`)).data;
    const info = card(d.shortPlayInfo);
    const episodes = (d.episodeList || []).map((e) => ({
      key: String(e.episode),
      number: e.episode,
      locked: !!e.is_lock,
    }));
    return {
      id: info.id,
      title: info.title,
      cover: info.cover,
      description: d.shortPlayInfo.description || '',
      tags: info.tags,
      totalEpisodes: d.shortPlayInfo.episode_total || episodes.length,
      episodes,
    };
  },
  async stream(id, key) {
    const d = (await upstream(SOURCE, `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 })).data;
    // video_info selalu episode 1; URL episode yang diminta ada di video_url.
    const url = d.video_url;
    return { url, type: /\.mp4(\?|$)/.test(url) ? 'mp4' : 'hls', proxy: false };
  },
};
