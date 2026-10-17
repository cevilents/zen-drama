// SekaiDrama -> Anichin adapter
// Implements the sansekai upstream contract (paths + shapes the app's route
// handlers expect) on top of the free, keyless Anichin aggregator.
// Run: node server/adapter.mjs   (listens on :3001)
//
// Point the app at it via NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001/api

import http from "http";

const PORT = Number(process.env.ADAPTER_PORT || 3001);
const ANICHIN = "https://miniapp.anichin.bio/api";
const ANICHIN_ORIGIN = "https://miniapp.anichin.bio";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const AH = { "User-Agent": UA, Referer: ANICHIN_ORIGIN + "/", Origin: ANICHIN_ORIGIN, Accept: "*/*" };
const ADAPTER_ORIGIN = `http://127.0.0.1:${PORT}`;
// Absolute adapter media endpoint (resolver/proxy). Wrapped by the app's own routes.
const murl = (source, id, ep, q) =>
  `${ADAPTER_ORIGIN}/api/media?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}&q=${encodeURIComponent(q || "")}`;

// ---------- Anichin client ----------
async function aj(path) {
  const res = await fetch(`${ANICHIN}${path}`, { headers: { ...AH, Accept: "application/json" } });
  if (!res.ok) throw new Error(`anichin ${res.status} ${path}`);
  return res.json();
}
const list = (j) => j?.items || j?.rows || (Array.isArray(j?.data) ? j.data : []) || [];
const abs = (u) => (typeof u === "string" && u.startsWith("/") ? ANICHIN_ORIGIN + u : u);
// Route media through the app's own /api/proxy/video so the browser avoids CORS.
const prox = (u) => `/api/proxy/video?url=${encodeURIComponent(abs(u))}`;

async function resolveEpisode(source, id, ep) {
  const j = await aj(`/${source}/episode?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}`);
  return j;
}
function pickQuality(j, q) {
  const listQ = j?.qualityList || j?.qualities || [];
  if (q && listQ.length) {
    const hit = listQ.find((x) => String(x.label || x.quality || x.definition) === String(q));
    if (hit) return hit.url || hit.streamUrl || hit.url;
  }
  const dflt = listQ.find((x) => x.isDefault) || listQ.find((x) => x.url) || listQ[0];
  return j?.videoUrl || dflt?.url || dflt?.streamUrl || "";
}

// episode count (for providers whose detail has no episode list: dramabox)
async function episodeCountByTitle(source, id) {
  try {
    const d = await aj(`/${source}/detail?id=${encodeURIComponent(id)}`);
    const title = d?.data?.title || d?.title;
    for (let page = 1; page <= 3; page++) {
      const s = await aj(`/${source}/search?query=${encodeURIComponent(title)}&page=${page}`);
      const hit = list(s).find((x) => String(x.id || x.dramaId) === String(id));
      if (hit) return hit.episodes || hit.totalEpisodes || 0;
      if (!list(s).length) break;
    }
  } catch {}
  return 0;
}

// ---------- shape helpers ----------
const itemId = (it) => it.id || it.dramaId;
const epCount = (it) => {
  if (!it) return 0;
  if (Array.isArray(it.episodes)) return it.episodes.length;
  return it.totalEpisodes || it.episodes || 0;
};

// sansekai DramaBox "Drama" card / detail (flat direct)
function toDramaBox(it) {
  const cats = it.categoryNames || [];
  return {
    bookId: String(itemId(it)),
    bookName: it.title || "",
    cover: it.cover || "",
    coverWap: it.cover || "",
    chapterCount: epCount(it),
    introduction: it.description || it.synopsis || "",
    tags: cats,
    tagNames: cats,
    tagV3s: cats.map((n, i) => ({ tagId: i, tagName: n, tagEnName: n })),
    protagonist: "",
    playCount: it.viewCount ? String(it.viewCount) : "",
    corner: { cornerType: 0, name: it.isCompleted === "1" ? "TAMAT" : "BARU", color: "#FF4D4F" },
    shelfTime: it.publishedAt || "",
    inLibrary: false,
  };
}

const RESOLVE_PREFIX = "anichin-resolve|";
const mkResolve = (source, id, ep, q) => `${RESOLVE_PREFIX}${source}|${id}|${ep}|${q}`;
const parseResolve = (u) => {
  if (typeof u !== "string" || !u.startsWith(RESOLVE_PREFIX)) return null;
  const [, source, id, ep, q] = u.split("|");
  return { source, id, ep, q };
};

// ---------- Anichin unified page -> app shapes ----------
async function getHome(source, page = 1) {
  const j = await aj(`/${source}/foryou?page=${page}`);
  return list(j);
}

// ============ DRAMABOX ============
async function dramaboxDetail(bookId) {
  const d = await aj(`/dramabox/detail?id=${encodeURIComponent(bookId)}`);
  const it = d.data || d;
  return toDramaBox(it);
}
async function dramaboxAllEpisode(bookId) {
  // Episode list with lazy-resolve video paths.
  const d = await aj(`/dramabox/detail?id=${encodeURIComponent(bookId)}`);
  let eps = [];
  if (Array.isArray(d?.data?.episodes) && d.data.episodes.length) {
    eps = d.data.episodes;
  } else {
    const n = await episodeCountByTitle("dramabox", bookId);
    eps = Array.from({ length: n }, (_, i) => ({ number: i + 1, episodeNumber: i + 1 }));
  }
  return eps.map((e, idx) => {
    const num = e.number || e.episodeNumber || idx + 1;
    const qualities = [1080, 720, 540];
    return {
      chapterId: String(idx),
      chapterIndex: idx,
      isCharge: 0,
      chapterName: e.title || e.episodeTitle || `Episode ${num}`,
      chapterImg: "",
      chargeChapter: false,
      useMultiSubtitle: 0,
      cdnList: [
        {
          cdnDomain: "anichin",
          isDefault: 1,
          videoPathList: qualities.map((q, qi) => ({
            quality: q,
            videoPath: mkResolve("dramabox", bookId, num, q),
            isDefault: qi === 1 ? 1 : 0,
            isVipEquity: 0,
          })),
        },
      ],
    };
  });
}
async function dramaboxList(source, page) {
  const j = await aj(`/dramabox/${source}${page ? `?page=${page}` : ""}`);
  return list(j).map(toDramaBox);
}
async function dramaboxSearch(query) {
  const j = await aj(`/dramabox/search?query=${encodeURIComponent(query)}`);
  return list(j).map((it) => ({
    ...toDramaBox(it),
    protagonist: "",
    tagNames: it.categoryNames || [],
  }));
}

// ============ REELSHORT ============
async function reelshortDetail(bookId) {
  const d = await aj(`/reelshort/detail?id=${encodeURIComponent(bookId)}`);
  const it = d.data || d;
  return {
    success: true,
    bookId: String(itemId(it)),
    title: it.title || "",
    cover: it.cover || "",
    description: it.description || it.synopsis || "",
    totalEpisodes: epCount(it),
  };
}
async function reelshortList(page) {
  const j = await aj(`/reelshort/foryou?page=${page}`);
  return {
    data: {
      lists: list(j).map((it) => ({
        book_id: String(itemId(it)),
        book_title: it.title,
        book_pic: it.cover,
        chapter_count: epCount(it),
        special_desc: it.description || it.synopsis || "",
        start_play_episode: 0,
      })),
    },
  };
}
async function reelshortSearch(query) {
  const j = await aj(`/reelshort/search?query=${encodeURIComponent(query)}`);
  return {
    results: list(j).map((it) => ({
      bookId: String(itemId(it)),
      title: it.title,
      cover: it.cover,
      description: it.description || it.synopsis || "",
      chapterCount: epCount(it),
      tag: (it.categoryNames || [])[0] || "",
    })),
  };
}
async function reelshortEpisode(bookId, ep) {
  const j = await resolveEpisode("reelshort", bookId, ep);
  const qs = j.qualityList || [];
  const videoList = (qs.length ? qs : [{ label: "720p", url: j.videoUrl, isDefault: true }]).map((x) => {
    const label = String(x.label || "720p").replace(/[^0-9]/g, "");
    const qn = label === "" ? 0 : Number(label);
    return {
      url: prox(x.url || j.videoUrl),
      encode: "H264",
      quality: qn >= 1000 ? 0 : qn,
      bitrate: "",
    };
  });
  return { success: true, isLocked: !!j.locked, videoList };
}
async function reelshortHomepage() {
  const j = await aj(`/reelshort/homepage`);
  const books = list(j).map((it) => ({
    book_id: String(itemId(it)),
    book_title: it.title,
    book_pic: it.cover,
    special_desc: it.description || it.synopsis || "",
    chapter_count: epCount(it),
    theme: (it.categoryNames || [])[0] || "",
    start_play_episode: 0,
    book_mark: it.isCompleted === "1" ? "TAMAT" : "",
  }));
  return {
    success: true,
    data: {
      tab_list: [{ tab_id: 0, tab_name: "Beranda" }],
      lists: [{ tab_id: 0, banners: [], books }],
    },
  };
}

// ============ SHORTMAX ============
async function shortmaxDetail(id) {
  const d = await aj(`/shortmax/detail?id=${encodeURIComponent(id)}`);
  const it = d.data || d;
  return {
    data: {
      id: String(itemId(it)),
      shortPlayCode: String(itemId(it)),
      shortPlayName: it.title || "",
      picUrl: it.cover || "",
      summary: it.description || it.synopsis || "",
      recommendContent: it.description || "",
      labelResponseList: (it.categoryNames || []).map((n) => ({ labelName: n })),
      totalEpisodes: epCount(it),
      updateEpisode: it.episodes?.length || it.totalEpisodes || 0,
      lockBegin: 0,
      collectNum: it.favoriteCount || 0,
    },
  };
}
function shortmaxList(items) {
  return {
    results: items.map((it) => ({
      shortPlayId: String(itemId(it)),
      name: it.title,
      cover: it.cover,
      totalEpisodes: epCount(it),
      playNum: it.viewCount || 0,
      label: (it.categoryNames || [])[0] || "",
      collectNum: it.favoriteCount || 0,
      summary: it.description || it.synopsis || "",
    })),
    total: items.length,
  };
}
async function shortmaxForYou(page) {
  const j = await aj(`/shortmax/foryou?page=${page}`);
  const r = shortmaxList(list(j));
  return { ...r, isEnd: !j.hasMore, total: j.total || r.total };
}
async function shortmaxSearch(query) {
  const j = await aj(`/shortmax/search?query=${encodeURIComponent(query)}`);
  return {
    results: list(j).map((it) => ({
      shortPlayId: String(itemId(it)),
      shortPlayCode: String(itemId(it)),
      name: it.title,
      cover: it.cover,
      genre: it.categoryNames || [],
    })),
    total: j.total || list(j).length,
  };
}
async function shortmaxEpisode(id, ep) {
  const j = await resolveEpisode("shortmax", id, ep);
  const qs = j.qualityList || [];
  const videoUrl = {};
  for (const x of qs) videoUrl[String(x.label || "720p")] = murl("shortmax", id, ep, String(x.label || "720p"));
  if (!Object.keys(videoUrl).length && j.videoUrl) videoUrl["720p"] = murl("shortmax", id, ep, "720p");
  return {
    status: "ok",
    shortPlayId: String(id),
    shortPlayName: "",
    totalEpisodes: 0,
    episode: {
      episodeNumber: Number(j.number || ep),
      id: String(j.number || ep),
      duration: 60,
      locked: !!j.locked,
      cover: "",
      videoUrl,
    },
  };
}

// ============ GOODSHORT ============
function gsItem(it) {
  return {
    bookId: String(itemId(it)),
    bookName: it.title,
    cover: it.cover,
    image: it.cover,
    introduction: it.description || it.synopsis || "",
    chapterCount: epCount(it),
    viewCount: it.viewCount || 0,
    viewCountDisplay: String(it.viewCount || 0),
    labels: it.categoryNames || [],
    typeTwoNames: it.categoryNames || [],
    fullHDEnable: true,
    downloadEnable: true,
    showLike: true,
    inLibrary: false,
    unrealBook: false,
    interactive: false,
    member: 0,
    bookType: 1,
    sequence: 0,
    ratings: 0,
    actionType: "",
    action: "",
    pseudonym: "",
    firstChapterId: 0,
  };
}
async function goodshortDetail(bookId) {
  const d = await aj(`/goodshort/detail?id=${encodeURIComponent(bookId)}`);
  const it = d.data || d;
  return {
    data: {
      book: {
        bookId: String(itemId(it)),
        bookName: it.title,
        cover: it.cover,
        chapterCount: epCount(it),
        introduction: it.description || it.synopsis || "",
        labels: it.categoryNames || [],
      },
    },
    status: 200,
    success: true,
  };
}
function rankList(items) {
  return {
    data: {
      current: 1,
      size: items.length,
      total: items.length,
      pages: 1,
      records: [{ channelId: 1, columnId: 1, name: "", style: "", items: items.map(gsItem) }],
    },
    status: 200,
    message: "SUCCESS",
    timestamp: Date.now(),
    success: true,
  };
}
async function goodshortList(ep) {
  const j = await aj(`/goodshort/${ep}`);
  return rankList(list(j));
}
async function goodshortForYou(page) {
  const j = await aj(`/goodshort/foryou?page=${page}`);
  const items = list(j).map(gsItem);
  return {
    data: {
      current: Number(page),
      size: items.length,
      total: j.total || items.length,
      pages: Math.max(1, Number(page) + (j.hasMore ? 1 : 0)),
      records: [{ channelId: 1, columnId: 1, name: "", style: "", items }],
    },
    status: 200,
    success: true,
  };
}
async function goodshortSearch(query) {
  const j = await aj(`/goodshort/search?query=${encodeURIComponent(query)}`);
  return {
    data: { searchResult: { records: list(j).map(gsItem) } },
    status: 200,
    success: true,
  };
}
async function goodshortAllEpisode(bookId) {
  const d = await aj(`/goodshort/detail?id=${encodeURIComponent(bookId)}`);
  const it = d.data || d;
  let n = epCount(it);
  if (!n) n = await episodeCountByTitle("goodshort", bookId);
  const downloadList = Array.from({ length: n }, (_, i) => {
    const ep = i + 1;
    return {
      id: ep,
      multiVideos: [1080, 720, 540].map((q) => ({
        type: `${q}p`,
        filePath: mkResolve("goodshort", bookId, ep, q),
      })),
    };
  });
  return { data: { bookName: it.title || "", downloadList }, status: 200, success: true };
}

// ============ NETSHORT ============
async function netshortDetail(id) {
  const d = await aj(`/netshort/detail?id=${encodeURIComponent(id)}`);
  const it = d.data || d;
  return {
    shortPlayId: String(itemId(it)),
    shortPlayLibraryId: String(itemId(it)),
    shortPlayName: it.title,
    shortPlayCover: it.cover,
    shotIntroduce: it.description || it.synopsis || "",
    shortPlayLabels: it.categoryNames || [],
    totalEpisode: epCount(it),
    isFinish: it.isCompleted === "1" ? 1 : 0,
    payPoint: 0,
    formatHeatScore: String(it.viewCount || ""),
    shortPlayEpisodeInfos: (it.episodes || []).map((e) => ({
      episodeId: String(e.number || e.episodeNumber),
      episodeNo: e.number || e.episodeNumber,
      episodeCover: "",
      isLock: e.locked ? 1 : 0,
      likeNums: 0,
    })),
  };
}
async function netshortForYou(page) {
  const j = await aj(`/netshort/foryou?page=${page}`);
  const items = list(j);
  return {
    contentInfos: items.map((it) => ({
      shortPlayId: String(itemId(it)),
      shortPlayLibraryId: String(itemId(it)),
      shortPlayName: it.title,
      shortPlayCover: it.cover,
      labelArray: it.categoryNames || [],
      heatScoreShow: String(it.viewCount || ""),
      scriptName: it.title,
    })),
    maxOffset: Number(page),
    completed: !j.hasMore,
  };
}
async function netshortSearch(query) {
  const j = await aj(`/netshort/search?query=${encodeURIComponent(query)}`);
  return {
    searchCodeSearchResult: list(j).map((it) => ({
      shortPlayId: String(itemId(it)),
      shortPlayLibraryId: String(itemId(it)),
      shortPlayName: it.title,
      shortPlayCover: it.cover,
      labelNameList: it.categoryNames || [],
      formatHeatScore: String(it.viewCount || ""),
      shotIntroduce: it.description || it.synopsis || "",
    })),
  };
}
async function netshortEpisode(id, ep) {
  const j = await resolveEpisode("netshort", id, ep);
  return {
    episodeList: [
      {
        episodeId: String(j.number || ep),
        episodeNo: Number(j.number || ep),
        playVoucher: prox(j.videoUrl),
        playVoucherBak: null,
        playClarity: "720p",
        sdkVid: null,
        subtitleList: (j.subtitles || []).map((s) => ({ url: s.url, subtitleLanguage: s.language })),
        unlockType: j.locked ? 1 : 0,
      },
    ],
    isMember: false,
  };
}
async function netshortTheaters() {
  const j = await aj(`/netshort/trending`);
  const items = list(j);
  return [
    {
      groupId: 1,
      contentName: "Trending",
      contentRemark: "",
      contentInfos: items.map((it) => ({
        shortPlayId: String(itemId(it)),
        shortPlayLibraryId: String(itemId(it)),
        shortPlayName: it.title,
        shortPlayCover: it.cover,
        labelArray: it.categoryNames || [],
        heatScoreShow: String(it.viewCount || ""),
        scriptName: it.title,
        totalEpisode: epCount(it),
      })),
    },
  ];
}

// ============ MELOLO ============
function meloloBook(it) {
  return {
    book_id: String(itemId(it)),
    book_name: it.title,
    thumb_url: it.cover,
    abstract: it.description || it.synopsis || "",
    serial_count: epCount(it),
    book_status: it.isCompleted === "1" ? "1" : "0",
  };
}
async function meloloList(ep, offset) {
  const j = await aj(`/melolo/${ep}${offset != null ? `?offset=${offset}` : ""}`);
  return { data: { books: list(j).map(meloloBook) }, code: 0 };
}
async function meloloSearch(query) {
  const j = await aj(`/melolo/search?query=${encodeURIComponent(query)}`);
  return { code: 0, data: { search_data: [{ books: list(j).map(meloloBook) }] } };
}
async function meloloDetail(bookId) {
  const d = await aj(`/melolo/detail?id=${encodeURIComponent(bookId)}`);
  const it = d.data || d;
  const eps = it.episodes || [];
  return {
    code: 0,
    data: {
      video_data: {
        series_id_str: String(itemId(it)),
        series_title: it.title || "",
        series_cover: it.cover || "",
        series_intro: it.description || it.synopsis || "",
        episode_cnt: epCount(it) || eps.length,
        video_list: eps.map((e) => ({
          vid: mkResolve("melolo", String(itemId(it)), e.number || e.episodeNumber, ""),
          vid_index: (e.number || e.episodeNumber) - 1,
          title: e.title || e.episodeTitle || "",
          cover: "",
        })),
      },
    },
  };
}
async function meloloStream(videoId) {
  const r = parseResolve(videoId);
  const j = r ? await resolveEpisode(r.source, r.id, r.ep || 1) : await resolveEpisode("melolo", videoId, 1);
  const qs = (j.qualityList || []).map((x) => ({ streamUrl: prox(x.url), definition: x.label, quality: x.label }));
  return { success: true, qualities: qs, streamUrl: prox(j.videoUrl) };
}

// ============ FLICKREELS ============
async function flickreelsDetail(playletId) {
  const d = await aj(`/flickreels/detail?id=${encodeURIComponent(playletId)}`);
  const it = d.data || d;
  const eps = it.episodes || [];
  return {
    data: {
      drama: {
        title: it.title || "",
        cover: it.cover || "",
        description: it.description || it.synopsis || "",
        chapterCount: epCount(it) || eps.length,
        labels: it.categoryNames || [],
      },
      episodes: eps.map((e) => ({
        id: String(e.number || e.episodeNumber),
        name: e.title || e.episodeTitle || "",
        num: e.number || e.episodeNumber,
        unlock: !e.locked,
        raw: { duration: 60 },
      })),
    },
    success: true,
  };
}
async function flickreelsEpisode(playletId, ep) {
  const j = await resolveEpisode("flickreels", playletId, ep);
  return {
    data: {
      playlet_title: "",
      chapter_title: `Episode ${ep}`,
      chapter_num: Number(j.number || ep),
      total_duration: 60,
      hls_url: murl("flickreels", playletId, ep, ""),
    },
    success: true,
  };
}
async function flickreelsList(ep) {
  const j = await aj(`/flickreels/${ep}`);
  return {
    data: {
      list: list(j).map((it) => ({
        playlet_id: itemId(it),
        title: it.title,
        cover: it.cover,
        upload_num: epCount(it),
        hot_num: String(it.viewCount || ""),
        playlet_tag_name: it.categoryNames || [],
      })),
    },
  };
}
async function flickreelsLatest() {
  const j = await aj(`/flickreels/latest`);
  const arr = list(j);
  return {
    data: [
      {
        list: arr.map((it) => ({
          playlet_id: itemId(it),
          title: it.title,
          cover: it.cover,
          upload_num: epCount(it),
          hot_num: String(it.viewCount || ""),
          playlet_tag_name: it.categoryNames || [],
        })),
      },
    ],
  };
}
async function flickreelsSearch(query) {
  const j = await aj(`/flickreels/search?query=${encodeURIComponent(query)}`);
  return {
    data: list(j).map((it) => ({
      playlet_id: itemId(it),
      title: it.title,
      cover: it.cover,
      upload_num: epCount(it),
      tag_list: (it.categoryNames || []).map((n) => ({ tag_name: n })),
      introduce: it.description || it.synopsis || "",
    })),
  };
}

// ============ FREEREELS ============
function frItem(it) {
  return {
    key: String(itemId(it)),
    id: String(itemId(it)),
    name: it.title,
    title: it.title,
    cover: it.cover,
    desc: it.description || it.synopsis || "",
    episode_count: epCount(it),
    follow_count: 0,
    content_tags: it.categoryNames || [],
  };
}
async function freereelsForYou(offset) {
  const j = await aj(`/freereels/foryou?page=${offset ? Math.floor(offset / 20) + 1 : 1}`);
  const items = list(j).map(frItem);
  return { code: 0, message: "ok", data: { items, page_info: { next: String((Number(offset) || 0) + 20), has_more: !!j.hasMore } } };
}
async function freereelsSearch(query) {
  const j = await aj(`/freereels/search?query=${encodeURIComponent(query)}`);
  return { code: 0, message: "ok", data: { items: list(j).map(frItem) } };
}
async function freereelsDetail(key) {
  const d = await aj(`/freereels/detail?id=${encodeURIComponent(key)}`);
  const it = d.data || d;
  const eps = it.episodes || [];
  return {
    data: {
      info: {
        id: String(itemId(it)),
        name: it.title || "",
        cover: it.cover || "",
        follow_count: 0,
        episode_list: eps.map((e) => ({
          id: String(e.number || e.episodeNumber),
          name: e.title || e.episodeTitle || "",
          video_url: "",
          m3u8_url: "",
          external_audio_h264_m3u8: prox(murl("freereels", itemId(it), e.number || e.episodeNumber, 720)),
          subtitle_list: (e.subtitles || []).map((s) => ({ language: s.language, subtitle: s.url, vtt: s.url })),
          original_audio_language: "id-ID",
        })),
      },
    },
  };
}
async function freereelsHome() {
  const j = await aj(`/freereels/homepage`);
  const items = list(j).map(frItem);
  return { code: 0, message: "ok", data: { items: [{ type: "grid", module_name: "Beranda", items }] } };
}

// ---------- media resolution ----------
async function resolveMedia(token) {
  const r = parseResolve(token);
  if (!r) return null;
  const j = await resolveEpisode(r.source, r.id, r.ep);
  let url = pickQuality(j, r.q);
  if (!url && j.videoUrl) url = j.videoUrl;
  return abs(url);
}

// ---------- router ----------
const routes = [
  // dramabox
  ["GET", /^\/api\/dramabox\/detail$/, (q) => dramaboxDetail(q.get("bookId"))],
  ["GET", /^\/api\/dramabox\/get-allepisode$/, (q) => dramaboxAllEpisode(q.get("bookId"))],
  ["GET", /^\/api\/dramabox\/foryou$/, (q) => dramaboxList("foryou", q.get("page") || 1)],
  ["GET", /^\/api\/dramabox\/latest$/, () => dramaboxList("latest")],
  ["GET", /^\/api\/dramabox\/trending$/, () => dramaboxList("trending")],
  ["GET", /^\/api\/dramabox\/search$/, (q) => dramaboxSearch(q.get("query") || "")],
  ["GET", /^\/api\/dramabox\/dubindo$/, () => dramaboxList("trending")],
  // reelshort
  ["GET", /^\/api\/reelshort\/get-detail$/, (q) => reelshortDetail(q.get("bookId"))],
  ["GET", /^\/api\/reelshort\/foryou$/, (q) => reelshortList(q.get("page") || 1)],
  ["GET", /^\/api\/reelshort\/search$/, (q) => reelshortSearch(q.get("query") || "")],
  ["GET", /^\/api\/reelshort\/get-episode$/, (q) => reelshortEpisode(q.get("bookId"), q.get("episodeNumber"))],
  ["GET", /^\/api\/reelshort\/homepage$/, () => reelshortHomepage()],
  // shortmax
  ["GET", /^\/api\/shortmax\/detail$/, (q) => shortmaxDetail(q.get("shortPlayId"))],
  ["GET", /^\/api\/shortmax\/foryou$/, (q) => shortmaxForYou(q.get("page") || 1)],
  ["GET", /^\/api\/shortmax\/latest$/, async () => shortmaxList(list(await aj("/shortmax/latest")))],
  ["GET", /^\/api\/shortmax\/rekomendasi$/, async () => shortmaxList(list(await aj("/shortmax/recommended")))],
  ["GET", /^\/api\/shortmax\/search$/, (q) => shortmaxSearch(q.get("query") || "")],
  ["GET", /^\/api\/shortmax\/get-episode$/, (q) => shortmaxEpisode(q.get("shortPlayId"), q.get("episodeNumber"))],
  // goodshort
  ["GET", /^\/api\/goodshort\/detail$/, (q) => goodshortDetail(q.get("bookId"))],
  ["GET", /^\/api\/goodshort\/latest$/, () => goodshortList("latest")],
  ["GET", /^\/api\/goodshort\/trending$/, () => goodshortList("trending")],
  ["GET", /^\/api\/goodshort\/foryou$/, (q) => goodshortForYou(q.get("page") || 1)],
  ["GET", /^\/api\/goodshort\/search$/, (q) => goodshortSearch(q.get("query") || "")],
  ["GET", /^\/api\/goodshort\/get-allepisode$/, (q) => goodshortAllEpisode(q.get("bookId"))],
  // netshort
  ["GET", /^\/api\/netshort\/detail$/, (q) => netshortDetail(q.get("shortPlayId"))],
  ["GET", /^\/api\/netshort\/foryou$/, (q) => netshortForYou(q.get("page") || 1)],
  ["GET", /^\/api\/netshort\/search$/, (q) => netshortSearch(q.get("query") || "")],
  ["GET", /^\/api\/netshort\/theaters$/, () => netshortTheaters()],
  ["GET", /^\/api\/netshort\/get-episode$/, (q) => netshortEpisode(q.get("shortPlayId"), q.get("episodeNumber"))],
  // melolo
  ["GET", /^\/api\/melolo\/get-latest$/, () => meloloList("latest")],
  ["GET", /^\/api\/melolo\/trending$/, () => meloloList("trending")],
  ["GET", /^\/api\/melolo\/foryou$/, (q) => meloloList("foryou", q.get("offset") || 0)],
  ["GET", /^\/api\/melolo\/search$/, (q) => meloloSearch(q.get("query") || "")],
  ["GET", /^\/api\/melolo\/detail$/, (q) => meloloDetail(q.get("book_id") || q.get("bookId"))],
  ["GET", /^\/api\/melolo\/get-episode$/, (q) => meloloStream(q.get("videoId"))],
  // flickreels
  ["GET", /^\/api\/flickreels\/detail$/, (q) => flickreelsDetail(q.get("playlet_id"))],
  ["GET", /^\/api\/flickreels\/get-episode$/, (q) => flickreelsEpisode(q.get("playlet_id"), q.get("episodeNumber"))],
  ["GET", /^\/api\/flickreels\/foryou$/, (q) => flickreelsList(`foryou?page=${q.get("page") || 1}`)],
  ["GET", /^\/api\/flickreels\/latest$/, () => flickreelsLatest()],
  ["GET", /^\/api\/flickreels\/search$/, (q) => flickreelsSearch(q.get("query") || "")],
  // freereels
  ["GET", /^\/api\/freereels\/homepage$/, () => freereelsHome()],
  ["GET", /^\/api\/freereels\/detailAndAllEpisode$/, (q) => freereelsDetail(q.get("key"))],
  ["GET", /^\/api\/freereels\/foryou$/, (q) => freereelsForYou(q.get("offset") || 0)],
  ["GET", /^\/api\/freereels\/search$/, (q) => freereelsSearch(q.get("query") || "")],
  ["GET", /^\/api\/freereels\/animepage$/, () => freereelsHome()],
];

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    // Generic media resolver/proxy used by wrapped app routes (shortmax hls,
    // flickreels hls) and by /api/proxy/video for direct-URL providers.
    if (u.pathname === "/api/media") {
      const source = u.searchParams.get("source");
      const id = u.searchParams.get("id");
      const ep = u.searchParams.get("ep") || "1";
      const q = u.searchParams.get("q") || "";
      const j = await resolveEpisode(source, id, ep);
      let cur = abs(pickQuality(j, q) || j.videoUrl || "");
      if (!cur) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "no media", source, id, ep, q })); }
      let buf, ct, finalUrl;
      for (let hop = 0; hop < 3; hop++) {
        // Anichin's own proxied endpoints need Referer/Origin; the CDNs they
        // redirect to reject those headers. Pick per hop.
        const hdrs = cur.includes("anichin.bio") ? AH : { "User-Agent": UA, Accept: "*/*" };
        const mr = await fetch(cur, { headers: hdrs, redirect: "follow" });
        if (!mr.ok) { res.writeHead(mr.status); return res.end("upstream media " + mr.status); }
        buf = Buffer.from(await mr.arrayBuffer());
        ct = mr.headers.get("content-type") || "";
        finalUrl = mr.url;
        // Some sources (flickreels) return a JSON {"url": "..."} indirection.
        const txt = buf.toString("utf8").trim();
        if (txt.startsWith("{")) {
          try { const o = JSON.parse(txt); if (o && o.url) { cur = o.url; continue; } } catch {}
        }
        break;
      }
      const head = buf.slice(0, 7).toString();
      if (head.startsWith("#EXTM3U") || ct.includes("mpegurl")) {
        const base = new URL(finalUrl);
        const text = buf.toString("utf8").split(/\r?\n/).map((line) => {
          const t = line.trim();
          if (!t || t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${new URL(uri, base).href}"`);
          try { return new URL(t, base).href; } catch { return line; }
        }).join("\n");
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
        return res.end(text);
      }
      res.writeHead(200, { "Content-Type": ct || "application/octet-stream", "Content-Length": String(buf.length), "Access-Control-Allow-Origin": "*" });
      return res.end(buf);
    }

    // Media sub-proxies (dramabox decrypt, goodshort decrypt-stream): resolve + redirect/stream
    if (u.pathname === "/api/dramabox/decrypt-video" || u.pathname === "/api/goodshort/decrypt-stream") {
      const token = u.searchParams.get("url") || "";
      const media = await resolveMedia(token);
      if (!media) {
        res.writeHead(400);
        return res.end("cannot resolve media");
      }
      if (u.pathname === "/api/dramabox/decrypt-video") {
        res.writeHead(302, { Location: media });
        return res.end();
      }
      // goodshort: fetch m3u8, absolutize segment lines, return
      const mr = await fetch(media, { headers: AH, redirect: "follow" });
      if (!mr.ok) { res.writeHead(mr.status); return res.end("upstream media " + mr.status); }
      const text = await mr.text();
      const base = new URL(mr.url);
      const out = text
        .split(/\r?\n/)
        .map((line) => {
          const t = line.trim();
          if (!t || t.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${new URL(uri, base).href}"`);
          }
          try {
            return new URL(t, base).href;
          } catch {
            return line;
          }
        })
        .join("\n");
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" });
      return res.end(out);
    }

    for (const [method, re, handler] of routes) {
      if (req.method === method && re.test(u.pathname)) {
        const data = await handler(u.searchParams);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify(data));
      }
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "adapter: no route", path: u.pathname }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e?.message || e), path: u.pathname }));
  }
});

server.listen(PORT, () => {
  console.log(`[SekaiDrama adapter] listening on http://127.0.0.1:${PORT}/api  (upstream: ${ANICHIN})`);
});
