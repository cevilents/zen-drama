// Serves the web build and /server.json, the "pointer" that tells the app where the API server
// currently lives. The server's Quick Tunnel address changes on every restart; the PC running it
// POSTs the new address here, so the APK and the web build never need a rebuild.
//
//   GET  /server.json  -> {"url": "https://....trycloudflare.com", "updatedAt": "..."}  (404 {"url":null} if unset)
//   POST /server.json  Authorization: Bearer <UPDATE_KEY>, body {"url": "https://..."}

const KEY = 'server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

// Hashing both sides first gives equal-length buffers for the constant-time compare.
async function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!given || !env.UPDATE_KEY) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(env.UPDATE_KEY)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Only a bare https origin is accepted, so the pointer can never send the app somewhere odd.
function originOf(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function pointer(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (request.method === 'GET' || request.method === 'HEAD') {
    const stored = await env.SERVER_POINTER.get(KEY, 'json');
    return stored ? json(200, stored) : json(404, { url: null });
  }

  if (request.method === 'POST') {
    if (!(await authorized(request, env))) return json(401, { error: 'unauthorized' });
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'invalid json' });
    }
    const url = originOf(body?.url);
    if (!url) return json(400, { error: 'url must be an https origin' });
    const value = { url, updatedAt: new Date().toISOString() };
    await env.SERVER_POINTER.put(KEY, JSON.stringify(value));
    return json(200, { ok: true, ...value });
  }

  return json(405, { error: 'method not allowed' });
}

// --- per-drama link previews ------------------------------------------------------------------
// /drama/<source>/<id> and /watch/<source>/<id> are client-rendered, so a shared link would preview
// as a bare shell. For link-preview crawlers we fetch the drama from the API and inject <title> +
// Open Graph/Twitter tags into the SPA shell. Real users keep the plain shell (no API round-trip) —
// pages stay fast. Best-effort: any failure just falls back to the shell.
const META_ROUTE = /^\/(?:drama|watch)\/([^/]+)\/([^/]+)\/?$/;
const META_TTL_SEC = 300;
const CRAWLER_RE =
  /facebookexternalhit|whatsapp|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|embedly|pinterest|googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|redditbot|skypeuripreview|vkshare|w3c_validator|bytespider|petalbot|nuzzel|outbrain|quora|semrush|ahrefs/i;

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (c) => map[c]);
}

function metaBlock({ title, description, image, url, type }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const i = escapeHtml(image);
  const u = escapeHtml(url);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="ZEN DRAMA" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
  ].join('\n    ');
}

async function dramaMeta(request, env, source, id) {
  const url = new URL(request.url);
  const ep = url.searchParams.get('ep');
  const fallback = {
    title: 'ZEN DRAMA — Nonton Drama Pendek China Sub Indo',
    description: 'Streaming drama pendek China sub Indo gratis: beranda, Untukmu, cari, dan simpan favorit.',
    image: `${url.origin}/logo512.png`,
    url: `${url.origin}${url.pathname}`,
    type: 'video.other',
  };
  try {
    const stored = await env.SERVER_POINTER.get('server', 'json');
    if (!stored?.url) return fallback;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${stored.url}/api/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const drama = await res.json();
    if (!drama || !drama.title) return fallback;
    return {
      title: `${drama.title}${ep ? ` Episode ${ep}` : ''} Sub Indo — ZEN DRAMA`,
      description: String(drama.description || fallback.description).slice(0, 200),
      image: drama.cover || fallback.image,
      url: fallback.url,
      type: 'video.other',
    };
  } catch {
    return fallback;
  }
}

async function pageWithMeta(request, env, ctx, source, id) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url), { method: 'GET' }));
  let html = await shell.text();
  const meta = metaBlock(await dramaMeta(request, env, source, id));
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/gi, '')
    .replace('</head>', `${meta}\n  </head>`);

  const response = new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${META_TTL_SEC}, s-maxage=${META_TTL_SEC}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// --- referral / source counting ---------------------------------------------------------------
// Shared links carry ?utm_source=<channel> (or ?ref=). The app beacons the source here once per
// session so the operator can see which channel/clip drives traffic, with no third-party analytics.
// Counters live in the same KV namespace as the server pointer, under a "ref:" prefix.
const REF_CLEAN_RE = /[^a-z0-9_-]/gi;

function cleanSource(value) {
  return String(value || '')
    .toLowerCase()
    .replace(REF_CLEAN_RE, '')
    .slice(0, 40);
}

async function bump(env, key) {
  const current = Number(await env.SERVER_POINTER.get(key)) || 0;
  await env.SERVER_POINTER.put(key, String(current + 1));
}

async function trackRef(request, env) {
  let source = '';
  try {
    const body = await request.json();
    source = cleanSource(body && (body.s || body.source));
  } catch {
    // Malformed body; nothing to count.
  }
  if (!source) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all([bump(env, `ref:${day}:${source}`), bump(env, `ref:${day}`), bump(env, `ref:total:${source}`)]);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

async function refStats(request, env) {
  const expected = env.STATS_KEY || env.UPDATE_KEY;
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !expected || key !== expected) return new Response('unauthorized', { status: 401 });
  const list = await env.SERVER_POINTER.list({ prefix: 'ref:' });
  const lines = [];
  for (const { name } of list.keys) lines.push(`${name} = ${await env.SERVER_POINTER.get(name)}`);
  return new Response(lines.sort().join('\n') || '(belum ada data)', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/server.json') return pointer(request, env);
    if (pathname === '/t' && request.method === 'POST') return trackRef(request, env);
    if (pathname === '/t/stats') return refStats(request, env);
    if (request.method === 'GET' && CRAWLER_RE.test(request.headers.get('user-agent') || '')) {
      const match = META_ROUTE.exec(pathname);
      if (match) {
        try {
          return await pageWithMeta(request, env, ctx, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
        } catch {
          // Fall through to the plain shell so the app still loads.
        }
      }
    }
    return env.ASSETS.fetch(request);
  },
};
