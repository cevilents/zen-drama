// Velolo (Narto Drama, prefix /api). Id video sama untuk semua bahasa; ?lang (id, en) melokalkan judul/sinopsis dan
// subtitle. Sebagian judul hanya ada di katalog id (en 404), jadi detail/stream mencoba ulang dengan 'id'.
// Stream: HLS di BunnyCDN tanpa header CORS (playlist maupun segmen) -> proxy: true. Tanpa paywall.
// Key episode = nomor episode. Subtitle .srt bahasa permintaan ikut di stream().

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'velolo';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };
const HOME = [
  ['/get-hot', 'Populer'],
  ['/get-new', 'Rilis Terbaru'],
  ['/get-recommend', 'Rekomendasi'],
];

const call = (path, opts = {}, lang = langValue(LANGS)) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang, ...opts.query } });

// Bahasa permintaan dulu; judul yang tidak ada di katalog bahasa itu (404) diambil dari katalog id.
async function callAny(path, opts = {}) {
  const lang = langValue(LANGS);
  try {
    return [await call(path, opts, lang), lang];
  } catch (e) {
    if (e?.status !== 404 || lang === LANGS.id) throw e;
    return [await call(path, opts, LANGS.id), LANGS.id];
  }
}

// Cover berisi spasi ("POSTER ID.jpg"), di-encode agar aman dipakai di atribut/URL.
const fixUrl = (u) => (u ? String(u).replace(/ /g, '%20') : u);

const card = (v) => ({
  id: String(v.id),
  title: String(v.name ?? '').trim(),
  cover: fixUrl(v.cover),
  episodes: Number(v.total_episodes) || undefined,
  tags: (v.label || []).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || []).map(card).filter((d) => d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'Velolo',

  async home() {
    const pages = await Promise.allSettled(HOME.map(([path]) => call(path)));
    const sections = [];
    pages.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const items = cards(r.value.videos);
      if (items.length) sections.push({ title: HOME[i][1], items });
    });
    if (!sections.length) {
      throw pages.find((r) => r.status === 'rejected')?.reason || new UpstreamError('velolo: beranda kosong');
    }
    return { sections };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.videos) };
  },

  async detail(id) {
    // Indonesian: both calls in parallel as before; other languages need the detail's language for the episodes.
    let info;
    let eps;
    let lang = LANGS.id;
    if (langValue(LANGS) === LANGS.id) {
      [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    } else {
      [info, lang] = await callAny(`/get-detail/${encodeURIComponent(id)}`);
      eps = await call(`/get-episodes/${encodeURIComponent(id)}`, {}, lang);
    }
    const d = info.data;
    const episodes = (eps.episodes || []).map((e) => ({
      key: String(e.episode),
      number: e.episode,
      title: `Episode ${e.episode}`,
      locked: e.is_lock || undefined,
    }));
    return {
      id: String(d.id || id),
      title: String(d.name ?? '').trim(),
      cover: fixUrl(d.cover),
      description: String(d.introduction ?? '').trim(),
      tags: d.label || [],
      totalEpisodes: episodes.length || d.total_episodes || 0,
      // Katalog yang benar-benar dipakai: 'id' bila judul ini tidak ada di katalog Inggris (kd.mjs menampilkannya).
      lang,
      episodes,
    };
  },

  async stream(id, key) {
    const [d, lang] = await callAny(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.video_url) throw new UpstreamError('velolo: URL stream tidak ditemukan', 502);
    const subtitles = d.subtitle ? [{ lang, url: d.subtitle }] : undefined;
    return { url: d.video_url, type: 'hls', proxy: true, subtitles };
  },
};
