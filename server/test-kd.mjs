// Live end-to-end check for the per-provider (kd) sources against a RUNNING server:
// list -> search -> detail -> episode 1 -> fetch the stream, proxied or direct with CORS (and first subtitle).
// Usage: BASE=http://localhost:3099 node test-kd.mjs [source ...]   (default: every registered kd source)
import { has } from "./lib/kd.mjs";
import { SOURCES } from "./lib/sources.mjs";
import { PROXY, checkStream, head } from "./test-direct.mjs";

const BASE = (process.env.BASE || "http://localhost:3030").replace(/\/$/, "");
const CONCURRENCY = 4;
const args = process.argv.slice(2);
const targets = args.length ? args : SOURCES.map((s) => s.id).filter(has);

async function api(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(90000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status} ${body.error || ""}`.trim());
  return body;
}

async function check(source) {
  const row = { source, list: 0, love: 0, cinta: 0, eps: 0, type: "-", via: "-", subs: 0, ok: false, note: "" };
  const t = Date.now();
  try {
    const list = await api(`/api/list?source=${source}&type=trending`);
    row.list = list.items.length;
    const [love, cinta] = await Promise.all(
      ["love", "cinta"].map((q) => api(`/api/search?source=${source}&q=${q}`).then((r) => r.items).catch(() => [])),
    );
    row.love = love.length;
    row.cinta = cinta.length;
    // Some providers list a few titles whose detail is empty upstream; try the first three.
    const candidates = [...list.items, ...love, ...cinta].slice(0, 3);
    if (!candidates.length) throw new Error("no items");
    let first;
    let detail;
    let lastError;
    for (const item of candidates) {
      try {
        detail = await api(`/api/detail?source=${source}&id=${encodeURIComponent(item.id)}`);
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
    row.eps = detail.episodes.length;
    if (detail.episodes.some((e, i) => e.number !== i + 1)) throw new Error("episode numbers are not 1..N");
    const play = await api(`/api/episode?source=${source}&id=${encodeURIComponent(first.id)}&ep=1`);
    row.type = play.type;
    row.via = play.url.includes(PROXY) ? "proxy" : "direct";
    row.subs = play.subtitles.length;
    if (play.locked || !play.url) throw new Error("episode 1 unplayable (locked, empty url)");
    const problem = await checkStream(play);
    if (problem) throw new Error(problem);
    if (play.subtitles[0]) {
      const sub = await head(play.subtitles[0].url, 64);
      if (!sub.buf.toString("utf8").replace(/^﻿/, "").startsWith("WEBVTT")) row.note = `subtitle not WebVTT (${sub.type})`;
    }
    row.ok = true;
  } catch (err) {
    row.note = err.message;
  }
  row.ms = Date.now() - t;
  return row;
}

const rows = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  rows.push(...(await Promise.all(targets.slice(i, i + CONCURRENCY).map(check))));
}
console.log("source       result  list  love  cinta  eps  type  via     subs   ms  note");
for (const r of rows) {
  console.log(
    `${r.source.padEnd(12)} ${(r.ok ? "PASS" : "FAIL").padEnd(6)} ${String(r.list).padStart(5)} ${String(r.love).padStart(5)} ${String(r.cinta).padStart(6)} ${String(r.eps).padStart(4)}  ${r.type.padEnd(4)}  ${r.via.padEnd(6)} ${String(r.subs).padStart(4)} ${String(r.ms).padStart(6)}  ${r.note}`,
  );
}
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
