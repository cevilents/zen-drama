// AnyReel (Narto Drama). Bahasa konten hanya Inggris (/get-languages tidak punya Indonesia).
// Stream: HLS Tencent VOD tanpa psign di URL, CORS terbuka di playlist dan segmen .ts.
// Episode berbayar tetap diputar lewat /get-stream (upstream membukanya).

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'anyreel';
const PREFIX = '/api';

const call = (path, opts = {}) => upstream(SOURCE, path, { prefix: PREFIX, ...opts });

const ADULT_TAG = /\b(erotic|adult|nsfw|18\+)\b/i;
const TITLES = {
  'Popular Now': 'Populer Sekarang',
  'Weekly Recommended': 'Rekomendasi Mingguan',
  'Most Trending': 'Paling Trending',
  'HOT Dramas': 'Drama Terpanas',
  'Exclusive Originals': 'Orisinal Eksklusif',
};

const tagsOf = (x) => (x.tags || x.displayTags || []).map((t) => t.tagName).filter(Boolean);

// Item beranda memakai seriesId, hasil pencarian memakai id, feed memakai destinationLink.
function card(x) {
  return {
    id: String(x.seriesId || x.destinationLink || x.id || ''),
    title: x.name || x.seriesName || '',
    cover: x.coverImageUrl,
    episodes: x.totalEpisodes || undefined,
    tags: tagsOf(x).slice(0, 4),
    adult: x.riskLevel > 0 || x.dangerLevel > 0 || x.contentRating > 0 || tagsOf(x).some((t) => ADULT_TAG.test(t)),
  };
}

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .map(card)
    .filter((d) => d.id && d.title && d.cover && !d.adult && !seen.has(d.id) && seen.add(d.id))
    .map(({ adult, ...d }) => d);
};

export default {
  id: SOURCE,
  name: 'AnyReel',

  async home() {
    const [home, rank, feed] = await Promise.allSettled([call('/get-home'), call('/get-rank'), call('/get-feed')]);
    const sections = [];
    if (home.status === 'fulfilled') {
      for (const s of home.value.data?.sectionConfigs || []) {
        sections.push({ title: TITLES[s.name] || s.name, items: cards(s.series) });
      }
    }
    if (rank.status === 'fulfilled') sections.push({ title: 'Peringkat', items: cards(rank.value.data?.list) });
    if (feed.status === 'fulfilled') sections.push({ title: 'Rekomendasi', items: cards(feed.value.data?.waterFallFlows?.data) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || rank.reason || feed.reason || new UpstreamError('anyreel: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: cards(d.data?.data) };
  },

  async detail(id) {
    const { data: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const episodes = (d.dramaEpisodes || []).map((e) => ({
      key: String(e.episodeSort),
      number: e.episodeSort,
      title: e.title || `Episode ${e.episodeSort}`,
    }));
    return {
      id: String(id),
      title: d.seriesName,
      cover: d.coverImageUrl,
      description: d.synopsis || '',
      tags: tagsOf(d),
      totalEpisodes: d.totalEpisodes || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.video_url) throw new UpstreamError('anyreel: URL stream tidak ditemukan');
    // Upstream memberi http://; CDN yang sama melayani https.
    return { url: d.video_url.replace(/^http:/, 'https:'), type: 'hls', proxy: false };
  },
};
