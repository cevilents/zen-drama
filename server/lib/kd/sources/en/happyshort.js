// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/happyshort.js with the English upstream values from its php/sources/happyshort.php.
// Adapter HappyShort. Katalog Inggris lewat lang=en. /get-detail dan /get-stream mengabaikan lang (judul melekat pada
// id), jadi keduanya tetap lang=id seperti NANDA (cache bersama).
// Stream per episode dipilih dengan ?episode=<episode_order>; CDN media.tqshort.com tanpa CORS.

import { upstream } from '../../lib/upstream.js';

const SOURCE = 'happyshort';
const LANG = 'en';
const FIXED = 'id';

const card = (v) => ({
  id: String(v.video_id ?? v.id),
  title: v.video_name ?? v.name,
  cover: v.cover || v.big_cover || '',
  episodes: v.episode_num,
  tags: [],
});

// Nama channel campur emoji + terjemahan Mandarin ("🔥 Peringkat Viral 🔥 爆款榜單").
const cleanName = (s = '') => s.match(/[\p{Script=Latin}\d][\p{Script=Latin}\d\s&'’!:.-]*/u)?.[0].trim() || s;

export default {
  id: SOURCE,
  name: 'HappyShort',
  async home() {
    const [channels, ranking] = await Promise.allSettled([
      upstream(SOURCE, '/get-channels', { query: { lang: LANG } }),
      upstream(SOURCE, '/get-ranking', { query: { lang: LANG } }),
    ]);
    const sections = [];
    if (channels.status === 'fulfilled') {
      for (const c of channels.value.data ?? []) {
        if (c.style_type === 1) continue; // Swiper = carousel promosi
        sections.push({ title: cleanName(c.name), items: (c.videos ?? []).map(card) });
      }
    }
    if (ranking.status === 'fulfilled') {
      for (const r of (ranking.value.data ?? []).slice(0, 2)) {
        sections.push({ title: cleanName(r.name), items: (r.find ?? []).map(card) });
      }
    }
    return { sections: sections.filter((s) => s.items.length) };
  },
  async search(q) {
    const d = await upstream(SOURCE, '/search', { query: { lang: LANG, q } });
    return { items: (d.list ?? []).map(card) };
  },
  async detail(id) {
    const { data: d } = await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`, {
      query: { lang: FIXED },
    });
    return {
      id: String(d.video_id),
      title: d.name,
      cover: d.cover || d.big_cover || '',
      description: '', // upstream tidak menyediakan sinopsis di detail
      tags: [],
      totalEpisodes: d.total_episodes ?? d.episodes.length,
      episodes: d.episodes.map((e) => ({
        key: String(e.episode_order),
        number: e.episode_order,
        locked: !!e.locked,
      })),
    };
  },
  async stream(id, key) {
    const { data: d } = await upstream(SOURCE, `/get-stream/${encodeURIComponent(id)}`, {
      query: { lang: FIXED, episode: key },
      ttl: 60,
    });
    return { url: d.m3u8, type: 'hls', proxy: true };
  },
};
