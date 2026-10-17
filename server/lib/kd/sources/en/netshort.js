// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/netshort.js with the English upstream values from its php/sources/netshort.php.
// Adapter NetShort (narto-drama). Katalog Inggris (?lang=en); judul melekat pada shortPlayId.
// Stream: MP4 bertanda tangan (auth_key) dengan CORS terbuka + subtitle WebVTT.
// Catatan: upstream tidak memberi deskripsi/tag di get-detail.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'netshort';
const q = { lang: 'en' };

function card(p) {
  return {
    id: String(p.shortPlayId),
    title: String(p.shortPlayName).replace(/<\/?em>/g, ''),
    cover: p.shortPlayCover,
    episodes: p.totalEpisode || undefined,
    tags: p.labelArray || p.labelNameList || [],
  };
}

const cards = (list) => (list || []).filter((p) => p.shortPlayId && p.shortPlayName).map(card);

export default {
  id: SOURCE,
  name: 'NetShort',

  async home() {
    const [charts, all] = await Promise.allSettled([
      upstream(SOURCE, '/get-charts', { query: q }),
      upstream(SOURCE, '/get-home', { query: q }),
    ]);
    const c = charts.status === 'fulfilled' ? charts.value.data || {} : {};
    const sections = [
      { title: 'Sedang Tren', items: cards(c.mostTrending) },
      { title: 'Rilis Baru', items: cards(c.newRelease) },
      { title: 'Pencarian Teratas', items: cards(c.topSearch) },
      { title: 'Semua Serial', items: all.status === 'fulfilled' ? cards(all.value.data?.contentInfos) : [] },
    ].filter((s) => s.items.length);
    if (!sections.length) throw charts.reason || all.reason || new UpstreamError('netshort: beranda kosong');
    return { sections };
  },

  async search(query) {
    const d = await upstream(SOURCE, `/search/${encodeURIComponent(query)}`, { query: q });
    return { items: cards(d.data?.searchCodeSearchResult) };
  },

  async detail(id) {
    const { data: d } = await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`, { query: q });
    const episodes = (d.episodes || []).map((e) => ({
      key: String(e.episodeId),
      number: e.episodeNo,
      title: `Episode ${e.episodeNo}`,
    }));
    return {
      id: String(d.shortPlayId),
      title: d.shortPlayName,
      cover: d.cover,
      description: '',
      tags: [],
      totalEpisodes: d.totalEpisode || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const { data: d } = await upstream(SOURCE, `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, {
      query: q,
      ttl: 60,
    });
    // playVoucher level atas = episode yang diminta; episodeList bisa memuat episode tetangga.
    const ep = d.episodeList?.find((e) => String(e.episodeId) === String(key));
    const url = ep?.playVoucher || d.playVoucher;
    if (!url) throw new UpstreamError('netshort: URL stream tidak ditemukan');
    const subtitles = (ep?.subtitleList || d.subtitleList || [])
      .filter((s) => s.url)
      // subtitleLanguage = bahasa katalog serinya (en_US, id_ID, ...); cadangan: Inggris.
      .map((s) => ({ lang: s.subtitleLanguage || 'en', url: s.url }));
    return { url, type: 'mp4', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
