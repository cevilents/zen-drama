// Shared by test-kd.mjs and test-lang.mjs: fetch a stream the way a browser page would and judge it.
// A proxied url goes through this server's /api/proxy and is fetched plainly. Any other stream url is played directly
// from the CDN, so every request carries a Referer and is repeated for each page origin (localhost dev server and a
// random https tunnel origin); every response, redirect hops included, must allow that origin (CORS) and stay https.
import { randomBytes } from "node:crypto";

export const PROXY = "/api/proxy?";
const REFERER = "http://localhost:8082/";
const ORIGINS = ["http://localhost:8082", `https://x-${randomBytes(4).toString("hex")}.trycloudflare.com`];
const MAX_HOPS = 5;
const TIMEOUT_MS = 60000;

// One origin: follow redirects by hand so each hop is checked. Returns the final response (unread) and every problem seen.
async function follow(url, origin, extra) {
  const problems = [];
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const where = hop ? ` (hop ${hop})` : "";
    if (!current.startsWith("https://")) {
      problems.push(`not https: ${current.slice(0, 80)}${where}`);
      return { problems };
    }
    const res = await fetch(current, {
      headers: { ...extra, Origin: origin, Referer: REFERER },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const acao = res.headers.get("access-control-allow-origin");
    if (acao !== "*" && acao !== origin) {
      problems.push(`no CORS on ${new URL(current).host} (ACAO ${acao}, Origin ${origin})${where}`);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    return { res, url: current, problems };
  }
  problems.push(`more than ${MAX_HOPS} redirects`);
  return { problems };
}

// Direct url: the first origin's response is read by the caller, the other origins only contribute their problems.
async function fetchDirect(url, extra = {}) {
  const runs = await Promise.all(ORIGINS.map((origin) => follow(url, origin, extra)));
  for (const run of runs.slice(1)) await run.res?.body?.cancel();
  return { res: runs[0].res, url: runs[0].url || url, problem: runs.flatMap((r) => r.problems)[0] || "" };
}

async function fetchStream(url, extra) {
  if (url.includes(PROXY)) return { res: await fetch(url, { headers: extra, signal: AbortSignal.timeout(TIMEOUT_MS) }), url, problem: "" };
  return fetchDirect(url, extra);
}

export async function head(url, bytes) {
  const { res, problem } = await fetchStream(url, { Range: `bytes=0-${bytes - 1}` });
  if (!res) return { status: 0, type: "", buf: Buffer.alloc(0), problem };
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  return { status: res.status, type: res.headers.get("content-type") || "", buf, problem };
}

// Absolute URIs of a playlist (lines and URI="..." attributes; skd:/data: keys are not fetched).
async function playlist(url) {
  const { res, url: finalUrl, problem } = await fetchStream(url, {});
  if (!res) return { problem: `playlist ${problem}` };
  const text = await res.text();
  if (!res.ok) return { problem: `playlist HTTP ${res.status}` };
  if (!text.startsWith("#EXTM3U")) return { problem: `not a playlist (${res.headers.get("content-type")})` };
  if (problem) return { problem: `playlist ${problem}` };
  const abs = (u) => new URL(u, finalUrl).href;
  const uris = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((l) => abs(l.trim()));
  const tagged = [...text.matchAll(/URI="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(skd|data):/.test(u)).map(abs);
  return { uris, tagged, master: text.includes("#EXT-X-STREAM-INF") };
}

async function loads(url, what) {
  const r = await head(url, 1024);
  if (r.status !== 200 && r.status !== 206) return r.problem && !r.status ? `${what} ${r.problem}` : `${what} HTTP ${r.status}`;
  return r.problem ? `${what} ${r.problem}` : "";
}

// HLS through /api/proxy: #EXTM3U with every URI rewritten through /api/proxy, and its first URI must load.
// Direct HLS: https everywhere (master: every variant and rendition url; media playlist: every segment/key/map url),
// CORS on the playlist, first variant (fetched in full), its EXT-X-KEY/EXT-X-MAP/EXT-X-MEDIA URIs and first segment.
// MP4: 200/206 with an ftyp box or a video content-type; direct MP4 must also answer Range with 206 and allow CORS.
export async function checkStream(play) {
  const direct = !play.url.includes(PROXY);
  if (direct && !play.url.startsWith("https://")) return "direct url is not https";
  if (play.type === "hls") {
    const top = await playlist(play.url);
    if (top.problem) return top.problem;
    const all = [...top.uris, ...top.tagged];
    if (!all.length) return "playlist has no URIs";
    if (!direct) {
      if (all.some((u) => !u.includes(PROXY))) return "playlist has unproxied URIs";
      return loads(top.uris[0] || top.tagged[0], "first playlist URI");
    }
    if (all.some((u) => !u.startsWith("https://"))) return "playlist has non-https URIs (mixed content)";
    let media = top;
    if (top.master) {
      media = await playlist(top.uris[0]);
      if (media.problem) return `variant ${media.problem}`;
      if ([...media.uris, ...media.tagged].some((u) => !u.startsWith("https://"))) return "variant has non-https URIs (mixed content)";
    }
    if (!media.uris.length) return "variant has no segments";
    const checks = [...new Set([...(top.master ? top.tagged : []), ...media.tagged, media.uris[0]].filter(Boolean))];
    for (const u of checks) {
      const problem = await loads(u, u === media.uris[0] ? "first segment" : "playlist key/map/media");
      if (problem) return problem;
    }
    return "";
  }
  const { status, type, buf, problem } = await head(play.url, 4096);
  if (status !== 200 && status !== 206) return problem && !status ? `mp4 ${problem}` : `stream HTTP ${status}`;
  if (direct && status !== 206) return "direct mp4 ignores Range";
  if (problem) return `mp4 ${problem}`;
  if (!buf.length) return "empty mp4 body";
  return buf.subarray(4, 8).toString("latin1") === "ftyp" || /video|octet/.test(type) ? "" : `unexpected mp4 head (${type})`;
}
