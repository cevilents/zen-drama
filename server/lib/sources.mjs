// Melolo is excluded: its streams are CENC-encrypted HEVC that no client here can play.
// `langs` = content languages served (docs/LANG_CONTRACT.md). lang=id serves every source (English-only ones too);
// lang=en only those with "en", all through the kd adapters (kd.mjs). Verified live with test-lang.mjs (2026-10-15).
// dramanova is Indonesian here: its upstream ignores/garbles lang (lang=en answered a Russian catalog).
export const SOURCES = [
  { id: "reelshort", name: "ReelShort", langs: ["id", "en"] },
  { id: "dramabox", name: "DramaBox", langs: ["id", "en"] },
  { id: "freereels", name: "FreeReels", langs: ["id", "en"] },
  { id: "goodshort", name: "GoodShort", langs: ["id", "en"] },
  { id: "idrama", name: "iDrama", langs: ["id", "en"] },
  { id: "dramawave", name: "DramaWave", langs: ["id", "en"] },
  { id: "shortmax", name: "ShortMax", langs: ["id", "en"] },
  { id: "netshort", name: "NetShort", langs: ["id", "en"] },
  { id: "flickreels", name: "FlickReels", langs: ["id", "en"] },
  { id: "vyntage", name: "Vyntage", langs: ["en"] },
  { id: "happyshort", name: "HappyShort", langs: ["id", "en"] },
  { id: "dramanova", name: "DramaNova", langs: ["id"] },
  { id: "pinedrama", name: "PineDrama", langs: ["id"] },
  // Served by the per-provider adapters in kd/ (kd.mjs): Indonesian catalogs first, English-only last.
  // kalostv has an adapter but is not registered: its upstream answered only 502/503/timeouts on 2026-10-15.
  { id: "bibishort", name: "BibiShort", langs: ["id", "en"] },
  { id: "moboreels", name: "MoboReels", langs: ["id", "en"] },
  { id: "cubetv", name: "CubeTV", langs: ["id", "en"] },
  { id: "playlet", name: "Playlet", langs: ["id", "en"] },
  { id: "reelala", name: "Reelala", langs: ["id", "en"] },
  { id: "joyreels", name: "JoyReels", langs: ["id", "en"] },
  { id: "reelbuzz", name: "ReelBuzz", langs: ["id"] },
  { id: "starshort", name: "StarShort", langs: ["id", "en"] },
  { id: "velolo", name: "Velolo", langs: ["id", "en"] },
  { id: "sarostv", name: "SarosTV", langs: ["id", "en"] },
  { id: "reelife", name: "Reelife", langs: ["id"] },
  { id: "microdrama", name: "Micro Drama", langs: ["id"] },
  { id: "mydrama", name: "My Drama", langs: ["id", "en"] },
  { id: "flextv", name: "FlexTV", langs: ["id", "en"] },
  { id: "vigloo", name: "Vigloo", langs: ["id", "en"] },
  { id: "candyjar", name: "CandyJar", langs: ["en"] },
  { id: "myrelle", name: "Myrelle", langs: ["en"] },
  { id: "shortical", name: "Shortical", langs: ["id", "en"] },
  { id: "anyreel", name: "AnyReel", langs: ["en"] },
];

const NAMES = new Map(SOURCES.map((s) => [s.id, s.name]));
const LANGS = new Map(SOURCES.map((s) => [s.id, s.langs]));

export const isSource = (id) => NAMES.has(id);
export const sourceName = (id) => NAMES.get(id) || id;
export const sourceLangs = (id) => LANGS.get(id) || ["id"];
export const hasLang = (id, lang) => sourceLangs(id).includes(lang);
/** Language of an item served for `lang`: "en" in English mode, otherwise the source's own (English-only -> "en"). */
export const itemLang = (id, lang) => (lang === "en" || !hasLang(id, "id") ? "en" : "id");

// Health is tracked per channel: "anichin:<source>" for the aggregator, "narto:<source>" for the generic Narto
// client, "kd:<source>" for the per-provider adapters, "web:reelshort" for the scrape and "en:<source>" for the
// English catalog (kd adapters with lang=en). sourceStatus() covers the Indonesian channels only.
const channels = new Map();

export function recordHealth(channel, ok, error = "") {
  const h = channels.get(channel) || { streak: 0, lastOk: 0, lastFail: 0, lastError: "" };
  if (ok) {
    h.streak = 0;
    h.lastOk = Date.now();
  } else {
    h.streak++;
    h.lastFail = Date.now();
    h.lastError = error;
  }
  channels.set(channel, h);
}

export function channelStatus(channel) {
  const h = channels.get(channel);
  if (!h) return "unknown";
  if (h.streak === 0) return "up";
  return h.streak >= 2 || !h.lastOk ? "down" : "up";
}

// A source is "up" when any of its channels is up; "down" only when every known channel is down.
const CHANNEL_PREFIXES = ["anichin:", "narto:", "kd:", "web:"];

export function sourceStatus(id) {
  const known = CHANNEL_PREFIXES.map((prefix) => channelStatus(`${prefix}${id}`)).filter((s) => s !== "unknown");
  if (!known.length) return "unknown";
  return known.includes("up") ? "up" : "down";
}

// Circuit breaker: a channel already known to be down gets one attempt instead of the full retry budget.
export const attemptsFor = (channel, base) => (channelStatus(channel) === "down" ? 1 : base);

/** Health of a source in one content language: the English catalog has its own channel. */
export const statusFor = (id, lang) => (lang === "en" ? channelStatus(`en:${id}`) : sourceStatus(id));
