// Vigloo (drama pendek Korea, Narto Drama). Id program/season sama untuk semua bahasa. Tanpa lang upstream memberi
// Indonesia (dipertahankan untuk mode id); mode en mengirim lang=en (judul, logLine, genre). /get-stream TIDAK boleh
// diberi lang (HTTP 400) dan selalu membawa ~13 trek subtitle (semua diteruskan).
// Stream dikunci season_id + nomor episode, jadi key episode = "<seasonId>:<episode>".
// Episode terkunci tetap terbuka (auto-unlock upstream).

import { contentLang, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'vigloo';
const PREFIX = '/api';

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: contentLang() === 'en' ? 'en' : undefined, ...opts.query } });

const cover = (p) =>
  p.thumbnails?.find((t) => t.type === 0)?.url || p.thumbnailExpanded || p.thumbnails?.[0]?.url || p.titleImage || '';

const card = (p) => ({
  id: String(p.id),
  title: p.title,
  cover: cover(p),
  episodes: p.episodeCount || undefined,
  tags: [...new Set([...(p.genres || []), ...(p.metaTags || [])].map((t) => t.title))].slice(0, 4),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'Vigloo',
  async home() {
    const jobs = [
      ['Pilihan Untukmu', call('/get-discover')],
      ['Peringkat', call('/get-rank')],
      ['Terbaru', call('/browse', { query: { sort: 'LATEST', limit: 20 } })],
    ];
    const res = await Promise.allSettled(jobs.map((j) => j[1]));
    const sections = [];
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const items = uniq((r.value.programs || []).map(card));
      if (items.length) sections.push({ title: jobs[i][0], items });
    });
    if (!sections.length) throw new UpstreamError('vigloo: home kosong', 502);
    return { sections };
  },
  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: uniq((d.data || []).map(card)) };
  },
  async detail(id) {
    const { detail: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const seasons = d.seasons || [];
    const multi = seasons.length > 1;
    const episodes = [];
    for (const s of seasons) {
      for (let ep = 1; ep <= s.episodeCount; ep++) {
        episodes.push({
          key: `${s.id}:${ep}`,
          number: episodes.length + 1,
          title: multi ? `Musim ${s.seasonNumber} Episode ${ep}` : `Episode ${ep}`,
        });
      }
    }
    return {
      id: String(d.id),
      title: d.title,
      cover: cover(d),
      description: d.logLine || d.description || d.synopsis || '',
      tags: [...new Set([...(d.genres || []), ...(d.metaTags || [])].map((t) => t.title))],
      totalEpisodes: episodes.length,
      episodes,
    };
  },
  async stream(id, key) {
    const [season, ep] = String(key).split(':');
    if (!season || !ep) throw new UpstreamError('vigloo: key episode tidak valid', 400);
    const d = await upstream(SOURCE, `/get-stream/${encodeURIComponent(season)}/${encodeURIComponent(ep)}`, { prefix: PREFIX, ttl: 60 });
    if (!d.stream_url) throw new UpstreamError('vigloo: stream tidak tersedia', 502);
    // Kode ISO 639-2/BCP-47 (ind, eng, zh-hans, pt-br, ...) dinormalkan di kd.mjs.
    const subtitles = (d.subtitles || [])
      .filter((x) => x?.language && (x.vtt_url || x.url))
      .map((x) => ({ lang: x.language, url: x.vtt_url || x.url }));
    // Master HLS fMP4/CMAF lewat proxy stream upstream yang sudah ber-CORS.
    return { url: d.stream_url, type: 'hls', proxy: false, subtitles };
  },
};
