// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/dramawave.js with the English upstream values from its php/sources/dramawave.php.
// Adapter DramaWave. Katalog Inggris lewat lang=en-US. Subtitle: semua trek (~25 bahasa) diteruskan.
// Stream: /get-stream/<series>/<episode_id>. HLS fMP4 di video-v*.mydramawave.com tanpa CORS.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'dramawave';
const LANG = 'en-US';
const TABS = [['678', 'Populer'], ['681', 'Baru']];

const card = (v) => ({
  id: v.key ?? v.id,
  title: v.title ?? v.name,
  cover: v.cover || '',
  episodes: v.episode_count,
  tags: v.content_tags ?? [],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  id: SOURCE,
  name: 'DramaWave',
  async home() {
    const calls = [
      upstream(SOURCE, '/get-foryou', { query: { lang: LANG } }).then((d) => [
        { title: 'Untuk Kamu', items: (d.data?.items ?? []).map((i) => card(i)) },
      ]),
      ...TABS.map(([tab, label]) =>
        upstream(SOURCE, '/get-channel-content', { query: { lang: LANG, tab_key: tab } }).then((d) =>
          (d.data?.items ?? [])
            .filter((m) => m.type !== 'banner')
            .map((m) => ({ title: m.module_name || label, items: (m.items ?? []).map(card) })),
        ),
      ),
    ];
    const done = await Promise.allSettled(calls);
    const sections = done.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    return { sections: sections.filter((s) => s.items.length) };
  },
  async search(q) {
    // Upstream kadang membalas rate_limited:true dengan hasil kosong; jangan di-cache, coba ulang.
    for (let i = 0; i < 4; i++) {
      const d = await upstream(SOURCE, '/search', { query: { lang: LANG, q }, ttl: 0 });
      if (!d.rate_limited) return { items: (d.items ?? []).map(card) };
      await sleep(1500);
    }
    return { items: [] };
  },
  async detail(id) {
    // /get-episodes sudah memuat URL stream dan status unlock (episode berbayar dibuka upstream).
    const { data: d } = await upstream(SOURCE, `/get-episodes/${encodeURIComponent(id)}`, {
      query: { lang: LANG },
    });
    return {
      id: d.id,
      title: d.name,
      cover: d.cover || '',
      description: d.desc || '',
      tags: d.content_tags ?? [],
      totalEpisodes: d.episode_count ?? d.episodes.length,
      episodes: d.episodes.map((e) => ({ key: e.id, number: e.index, locked: e.unlock === false })),
    };
  },
  async stream(id, key) {
    const { data: d } = await upstream(
      SOURCE,
      `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`,
      { query: { lang: LANG }, ttl: 60 },
    );
    const url = d.h264_m3u8 || d.h265_m3u8;
    if (!url) throw new UpstreamError('dramawave: URL stream tidak ditemukan');
    const subtitles = (d.subtitles ?? [])
      .filter((x) => x?.language && (x.vtt || x.srt))
      .map((x) => ({ lang: x.language, url: x.vtt || x.srt }));
    return { url, type: 'hls', proxy: true, subtitles };
  },
};
