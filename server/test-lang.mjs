// Live check of content-language support (docs/LANG_CONTRACT.md) against a RUNNING server.
// Usage: BASE=http://localhost:3099 node test-lang.mjs [source ...]   (default: every source listed by /api/sources?lang=en)
// 1. /api/sources for id and en, /api/home?lang=en (unique keys, `~en` ids, lang "en"), /api/search?lang=en&q=love.
// 2. Per English source: list -> detail (`~en` id) -> episode 1 -> stream (#EXTM3U or mp4 ftyp; direct urls need CORS) -> subtitles
//    (ISO-639-1, one per language, en first, WebVTT). The same `~en` id with lang=id must return the English item.
// 3. Indonesian regression: reelshort, dramabox, goodshort with lang=id (bare ids, lang "id", playable episode 1), and a
//    bare id requested with lang=en must still open the Indonesian catalog.
import { PROXY, checkStream, head } from "./test-direct.mjs";

const BASE = (process.env.BASE || "http://localhost:3030").replace(/\/$/, "");
const CONCURRENCY = 4;
// ISO-639-1 where one exists; a few languages only have a 3-letter code (e.g. yue).
const ISO = /^[a-z]{2,3}$/;

async function api(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(90000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status} ${body.error || ""}`.trim());
  return body;
}

// Requested language first, then en, id, the rest; ISO codes; one track per language; first track is WebVTT.
async function checkSubtitles(subs, wanted) {
  const langs = subs.map((s) => s.language);
  if (langs.some((l) => !ISO.test(l))) return `non ISO-639-1 code (${langs.join(",")})`;
  if (new Set(langs).size !== langs.length) return `duplicate languages (${langs.join(",")})`;
  const rank = (l) => (l === wanted ? 0 : l === "en" ? 1 : l === "id" ? 2 : 3);
  if (langs.some((l, i) => i && rank(langs[i - 1]) > rank(l))) return `bad order (${langs.join(",")})`;
  if (subs.some((s) => !s.label || !s.url.includes(PROXY))) return "subtitle without label or proxy url";
  if (!subs[0]) return "";
  const sub = await head(subs[0].url, 64);
  return sub.buf.toString("utf8").replace(/^﻿/, "").startsWith("WEBVTT") ? "" : `subtitle not WebVTT (${sub.type})`;
}

const results = [];
const record = (name, ok, note = "") => results.push({ name, ok, note });

async function step(name, fn) {
  try {
    record(name, true, (await fn()) || "");
  } catch (err) {
    record(name, false, err.message);
  }
}

await step("sources lang=id (32, langs)", async () => {
  const { items } = await api("/api/sources?lang=id");
  if (items.length !== 32) throw new Error(`${items.length} sources`);
  if (items.some((s) => !Array.isArray(s.langs) || !s.langs.length)) throw new Error("source without langs");
  return `${items.length} sources`;
});

let enSources = [];
await step("sources lang=en (en only)", async () => {
  const { items } = await api("/api/sources?lang=en");
  if (items.some((s) => !s.langs.includes("en"))) throw new Error("non-English source listed");
  enSources = items.map((s) => s.id);
  return `${items.length}: ${enSources.join(" ")}`;
});

await step("home lang=en", async () => {
  const { sections } = await api("/api/home?lang=en");
  const keys = sections.map((s) => s.key);
  if (new Set(keys).size !== keys.length) throw new Error(`duplicate keys ${keys.join(",")}`);
  const items = sections.flatMap((s) => s.items);
  const bad = items.find((d) => !d.id.endsWith("~en") || d.lang !== "en" || !enSources.includes(d.source));
  if (bad) throw new Error(`bad item ${bad.source}/${bad.id} lang=${bad.lang}`);
  return `${sections.length} sections, ${items.length} items, ${new Set(items.map((d) => d.source)).size} sources`;
});

await step("feed lang=en", async () => {
  const { items } = await api("/api/feed?lang=en&page=1");
  if (!items.length) throw new Error("empty");
  if (items.some((d) => !d.id.endsWith("~en") || d.lang !== "en")) throw new Error("item without ~en/lang");
  return `${items.length} items`;
});

await step("search lang=en q=love", async () => {
  const { items } = await api("/api/search?lang=en&q=love");
  if (!items.length) throw new Error("no results");
  if (items.some((d) => !d.id.endsWith("~en") || d.lang !== "en")) throw new Error("item without ~en/lang");
  return `${items.length} items from ${new Set(items.map((d) => d.source)).size} sources`;
});

await step("list lang=en of an id-only source is empty", async () => {
  const { items } = await api("/api/list?lang=en&source=reelbuzz");
  if (items.length) throw new Error(`${items.length} items`);
});

// Per-source English chain.
async function checkEn(source) {
  const row = { source, list: 0, eps: 0, type: "-", via: "-", subs: "", ok: false, note: "" };
  const t = Date.now();
  try {
    const list = await api(`/api/list?source=${source}&type=trending&lang=en`);
    row.list = list.items.length;
    if (!list.items.length) throw new Error("empty list");
    if (list.items.some((d) => !d.id.endsWith("~en") || d.lang !== "en")) throw new Error("list item without ~en/lang");
    let first;
    let detail;
    let lastError;
    for (const item of list.items.slice(0, 3)) {
      try {
        detail = await api(`/api/detail?source=${source}&id=${encodeURIComponent(item.id)}&lang=en`);
        if (detail.episodes.length) {
          first = item;
          break;
        }
        lastError = new Error(`detail ${item.id} has no episodes`);
      } catch (err) {
        lastError = err;
      }
    }
    if (!first) throw lastError;
    if (detail.id !== first.id || detail.lang !== "en") throw new Error(`detail id/lang ${detail.id}/${detail.lang}`);
    row.eps = detail.episodes.length;
    if (detail.episodes.some((e, i) => e.number !== i + 1)) throw new Error("episode numbers are not 1..N");
    // A `~en` id opened in Indonesian mode still serves the English item.
    const cross = await api(`/api/detail?source=${source}&id=${encodeURIComponent(first.id)}&lang=id`);
    if (cross.title !== detail.title || cross.lang !== "en") throw new Error(`~en with lang=id gave "${cross.title}" (${cross.lang})`);
    const play = await api(`/api/episode?source=${source}&id=${encodeURIComponent(first.id)}&ep=1&lang=en`);
    if (play.id !== first.id) throw new Error(`episode id ${play.id}`);
    row.type = play.type;
    row.via = play.url.includes(PROXY) ? "proxy" : "direct";
    row.subs = play.subtitles.map((s) => s.language).join(",");
    if (play.locked || !play.url) throw new Error("episode 1 unplayable (locked, empty url)");
    const problem = (await checkStream(play)) || (await checkSubtitles(play.subtitles, "en"));
    if (problem) throw new Error(problem);
    row.ok = true;
  } catch (err) {
    row.note = err.message;
  }
  row.ms = Date.now() - t;
  return row;
}

// Indonesian regression + bare id under lang=en.
async function checkId(source) {
  const list = await api(`/api/list?source=${source}&type=trending&lang=id`);
  if (!list.items.length) throw new Error("empty list");
  if (list.items.some((d) => d.id.includes("~") || d.lang !== "id")) throw new Error("id item with suffix or lang != id");
  let lastError;
  for (const item of list.items.slice(0, 3)) {
    try {
      const detail = await api(`/api/detail?source=${source}&id=${encodeURIComponent(item.id)}`);
      if (!detail.episodes.length) throw new Error(`detail ${item.id} has no episodes`);
      const bare = await api(`/api/detail?source=${source}&id=${encodeURIComponent(item.id)}&lang=en`);
      if (bare.title !== detail.title || bare.lang !== "id" || bare.id !== item.id) {
        throw new Error(`bare id with lang=en gave "${bare.title}" (${bare.lang})`);
      }
      const play = await api(`/api/episode?source=${source}&id=${encodeURIComponent(item.id)}&ep=1&lang=id`);
      if (play.locked || !play.url) throw new Error("episode 1 unplayable");
      const problem = (await checkStream(play)) || (await checkSubtitles(play.subtitles, "id"));
      if (problem) throw new Error(problem);
      const subs = play.subtitles.map((s) => s.language).join(",");
      const via = play.url.includes(PROXY) ? "proxy" : "direct";
      return `${list.items.length} items, ${detail.episodes.length} eps, ${play.type} ${via}${subs ? `, subs ${subs}` : ""}`;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

for (const source of ["reelshort", "dramabox", "goodshort"]) await step(`lang=id ${source}`, () => checkId(source));

const targets = process.argv.slice(2).length ? process.argv.slice(2) : enSources;
const rows = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  rows.push(...(await Promise.all(targets.slice(i, i + CONCURRENCY).map(checkEn))));
}

console.log("check                                        result  note");
for (const r of results) console.log(`${r.name.padEnd(44)} ${(r.ok ? "PASS" : "FAIL").padEnd(6)}  ${r.note}`);
console.log("\nsource (lang=en) result  list   eps  type  via        ms  subs / note");
for (const r of rows) {
  console.log(
    `${r.source.padEnd(16)} ${(r.ok ? "PASS" : "FAIL").padEnd(6)} ${String(r.list).padStart(5)} ${String(r.eps).padStart(5)}  ${r.type.padEnd(4)}  ${r.via.padEnd(6)} ${String(r.ms).padStart(6)}  ${r.ok ? r.subs : r.note}`,
  );
}
process.exitCode = results.every((r) => r.ok) && rows.every((r) => r.ok) ? 0 : 1;
