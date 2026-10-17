// Adapter FlexTV (narto-drama, prefix /api). Katalog per bahasa lewat lang=<kode pendek> (id, en; 'in' jatuh ke Inggris).
// ID seri terikat katalog: detail tetap berbahasa katalog, hanya tag yang ikut lang.
// Stream: MP4 langsung di app-resources-sgp-auth.flextv.cc (ber-CORS, mendukung Range).
// Upstream sangat tidak stabil (503/522/523 dan timeout puluhan detik): tiap panggilan dicoba sekali lagi.

import { contentLang, langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'flextv';
const PREFIX = '/api';
// classify_id berbeda per bahasa (/get-classify?lang=id): 414 Fokus, 415 Baru, 418 Wanita.
const LISTS = [['414', 'Fokus'], ['415', 'Baru'], ['418', 'Wanita']];
const LANGS = { id: 'id', en: 'en' };
// Dua kategori pertama katalog Inggris (/get-classify?lang=en, Okt 2026), cadangan bila /get-classify gagal.
const LISTS_EN_FALLBACK = [['347', 'Fokus'], ['348', 'Baru']];
// Kategori "Gratis Terbatas" (tanpa penanda di data upstream; dikenali dari namanya).
const LIMITED_FREE = /limit|terbatas|gratis|\bfree\b/i;

const call = async (path, opts = {}) => {
  const run = () => upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });
  try {
    return await run();
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) throw e;
    return run();
  }
};

const card = (s) => ({
  id: String(s.series_id),
  title: String(s.series_name ?? '').trim(),
  cover: s.cover || '',
  episodes: s.total_episodes || undefined,
  tags: s.tag ? [String(s.tag).trim()] : [],
});

const cards = (list) => {
  const seen = new Set();
  return (list ?? []).map(card).filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

// Indonesia: kategori tetap. Bahasa lain: tiga kategori type=play pertama dari /get-classify (nama sudah terlokalisasi),
// melewati "Gratis Terbatas" (ditambahkan belakangan, classify_id lebih besar dari kategori sesudahnya).
async function lists() {
  if (contentLang() === 'id') return LISTS;
  let cats;
  try {
    cats = (await call('/get-classify', { ttl: 21600 })).categories || [];
  } catch {
    return LISTS_EN_FALLBACK;
  }
  const out = [];
  cats.forEach((c, i) => {
    const id = Number(c?.classify_id) || 0;
    const name = String(c?.name ?? '').replace(/[\p{Extended_Pictographic}\uFE0F\u200B-\u200D]/gu, '').trim();
    const next = Number(cats[i + 1]?.classify_id) || Infinity;
    if (out.length >= 3 || c?.type !== 'play' || id <= 0 || id > next || LIMITED_FREE.test(name)) return;
    out.push([String(id), name || 'Pilihan']);
  });
  return out.length ? out : LISTS_EN_FALLBACK;
}

export default {
  id: SOURCE,
  name: 'FlexTV',

  async home() {
    const homeLists = await lists();
    const done = await Promise.allSettled(homeLists.map(([c]) => call('/get-list', { query: { classify_id: c } })));
    const sections = done.flatMap((r, i) => (r.status === 'fulfilled' ? [{ title: homeLists[i][1], items: cards(r.value.list) }] : []));
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw done.find((r) => r.status === 'rejected')?.reason || new UpstreamError('flextv: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.list) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    const d = info.detail;
    const episodes = (eps.episodes ?? []).map((e) => ({
      key: String(e.series_no),
      number: e.series_no,
      title: `Episode ${e.series_no}`,
      locked: e.is_charge === 1,
    }));
    return {
      id: String(d.series_id ?? id),
      title: String(d.series_name ?? '').trim(),
      cover: d.cover || '',
      description: String(d.description ?? '').trim(),
      tags: (d.tag ?? []).map((t) => String(t.tag_name).trim()).filter(Boolean),
      totalEpisodes: eps.total || d.max_series_no || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.video_url) throw new UpstreamError('flextv: URL stream tidak ditemukan');
    return { url: d.video_url, type: /\.m3u8(\?|$)/.test(d.video_url) ? 'hls' : 'mp4', proxy: false };
  },
};
