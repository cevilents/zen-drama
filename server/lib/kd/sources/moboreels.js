// Adapter MoboReels (narto-drama). Katalog per bahasa lewat ?lang= (id, en; channel sama untuk semua bahasa).
// Judul melekat pada seriesId; subtitle berbahasa serinya sendiri (kode di nama berkas subtitle).
// Stream: MP4 H264 di moboreels-e1.narto-drama.com dengan CORS terbuka (Range ok), tanpa referer.
// get-stream dengan ?seriesId= membuka episode berbayar otomatis.
// Catatan: channelId & episId di JSON melebihi 2^53 sehingga presisinya hilang saat di-parse;
// channel ditulis sebagai string di bawah, id episode diambil dari URL subtitle (angka utuh).

import { contentLang, langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'moboreels';
const LANGS = { id: 'id', en: 'en' };
const lq = () => ({ lang: langValue(LANGS) });
// Kode bahasa di nama berkas subtitle (".../1-EN_2026....srtx"), bukan ISO; hanya kode ini yang dipercaya.
const SUB_FILE_LANGS = {
  ID: 'id', EN: 'en', TH: 'th', VN: 'vi', ES: 'es', SP: 'es', PT: 'pt', BR: 'pt', JP: 'ja', KR: 'ko', FT: 'zh', JT: 'zh',
  CN: 'zh', FR: 'fr', DE: 'de', TR: 'tr', AR: 'ar', MS: 'ms', FIL: 'tl', HI: 'hi', RU: 'ru', IT: 'it', PL: 'pl',
};
// ?lang= angka di URL subtitleVtt (diamati 2026-10-15).
const VTT_LANGS = { 11: 'id', 3: 'en' };

// ID channel dari /get-channels ("Beranda" dan "Baru").
const CHANNELS = ['162602653701375558', '113757996389499537'];

function card(s) {
  return {
    id: String(s.seriesId),
    title: s.seriesName,
    cover: s.coverUrl,
    episodes: s.allEpis || s.lastEpis || undefined,
    tags: tagsOf(s),
  };
}

const tagsOf = (s) => s.types?.length ? s.types : (s.typeItemVOList || []).map((t) => t.typeName);
const cards = (list) => (list || []).map((x) => x.seriesVO).filter((s) => s?.seriesId && s.seriesName).map(card);
const epId = (e) => e.subtitleSrt?.match(/get-subtitle\/(\d+)/)?.[1] ?? String(e.episId);

export default {
  id: SOURCE,
  name: 'MoboReels',

  async home() {
    const [beranda, baru, hot] = await Promise.allSettled([
      upstream(SOURCE, `/get-channel/${CHANNELS[0]}`, { query: lq() }),
      upstream(SOURCE, `/get-channel/${CHANNELS[1]}`, { query: lq() }),
      upstream(SOURCE, '/get-hot', { query: lq() }),
    ]);
    const sections = [];
    const seen = new Set();
    for (const r of [beranda, baru]) {
      if (r.status !== 'fulfilled') continue;
      for (const s of r.value.data?.seriesList ?? []) {
        // Section tanpa judul = carousel banner. Judul memuat emoji di depan; "Rilis Baru" muncul di kedua channel.
        const title = (s.header?.title || 'Sorotan').replace(/^[^\p{L}\p{N}]+/u, '');
        if (seen.has(title)) continue;
        seen.add(title);
        sections.push({ title, items: cards(s.series) });
      }
    }
    if (hot.status === 'fulfilled') sections.push({ title: 'Terpopuler', items: cards(hot.value.data?.series) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw beranda.reason || baru.reason || hot.reason || new UpstreamError('moboreels: beranda kosong');
    return { sections: out };
  },

  async search(query) {
    const d = await upstream(SOURCE, `/search/${encodeURIComponent(query)}`, { query: lq() });
    const items = (d.data?.mainData?.rows ?? []).filter((s) => s.seriesId && s.seriesName).map(card);
    return { items };
  },

  async detail(id) {
    const { data: d } = await upstream(SOURCE, `/get-detail/${encodeURIComponent(id)}`, { query: lq() });
    const s = d.seriesVO || {};
    const episodes = (d.episodes ?? []).map((e) => ({
      key: epId(e),
      number: e.episNum,
      // Terkunci di daftar, tetapi stream() membukanya lewat seriesId.
      locked: false,
    }));
    return {
      id: String(s.seriesId ?? id),
      title: s.seriesName,
      cover: s.coverUrl,
      description: s.description || '',
      tags: tagsOf(s),
      totalEpisodes: d.totalEpisodes || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const { data: d } = await upstream(SOURCE, `/get-stream/${encodeURIComponent(key)}`, {
      query: { ...lq(), seriesId: id },
      ttl: 60,
    });
    // H265 tidak diputar semua browser; mediaUrl bawaan adalah H264 resolusi tertinggi.
    const media = (d.episMedia ?? []).filter((m) => m.codec === 'h264').sort((a, b) => b.resolution - a.resolution)[0];
    const url = media?.mediaUrl || d.mediaUrl;
    if (!url) throw new UpstreamError('moboreels: URL stream tidak ditemukan');
    // Bahasa subtitle = bahasa serinya, bukan ?lang= permintaan. subtitleVtt (".../get-subtitle/<episId>?lang=11&format=vtt")
    // adalah konversi berkas asli di `subtitles` (".../1-ID_20260624142357237.srtx"); kode di nama berkas itu cocok dengan
    // isi VTT (dicek 2026-10-15: ID -> teks Indonesia, EN -> teks Inggris), begitu juga lang angka di URL VTT (11 = id,
    // 3 = en). Urutan: kode nama berkas, lalu lang angka, lalu bahasa katalog.
    const code = String(d.subtitles ?? '').match(/-([A-Za-z]{2,3})_\d+\.\w+$/)?.[1]?.toUpperCase();
    const vttLang = VTT_LANGS[new URL(d.subtitleVtt || 'http://x').searchParams.get('lang')];
    const subtitles = d.subtitleVtt ? [{ lang: SUB_FILE_LANGS[code] || vttLang || contentLang(), url: d.subtitleVtt }] : [];
    return { url, type: 'mp4', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
