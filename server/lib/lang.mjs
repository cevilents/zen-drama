// Content language (docs/LANG_CONTRACT.md): every /api route except proxy/health takes `lang=id|en` (default id).
// Items from the English catalog carry the id suffix `~en`; a suffixed id always wins over the query `lang`.
// Also the subtitle normalization shared by every source: ISO-639-1 codes, one track per language, WebVTT via
// the proxy, requested language first, then en, id, the rest.
import { proxify } from "./proxy.mjs";

export const DEFAULT_LANG = "id";

export const langOf = (value) => (value === "en" ? "en" : DEFAULT_LANG);

const SUFFIX = /~(id|en)$/;

/** "abc~en" -> { id: "abc", lang: "en" }; "abc" -> { id: "abc", lang: null }. */
export function splitId(value) {
  const id = String(value ?? "");
  const m = SUFFIX.exec(id);
  return m ? { id: id.slice(0, m.index), lang: m[1] } : { id, lang: null };
}

export const withSuffix = (id, lang) => (lang === "en" ? `${id}~en` : String(id));

const NAMES = {
  id: "Indonesia",
  en: "English",
  zh: "中文",
  es: "Español",
  pt: "Português",
  th: "ไทย",
  vi: "Tiếng Việt",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  tr: "Türkçe",
  ar: "العربية",
  ms: "Bahasa Melayu",
  tl: "Filipino",
  hi: "हिन्दी",
  ru: "Русский",
  it: "Italiano",
  pl: "Polski",
  nl: "Nederlands",
  uk: "Українська",
  he: "עברית",
  cs: "Čeština",
  da: "Dansk",
  el: "Ελληνικά",
  et: "Eesti",
  fi: "Suomi",
  hr: "Hrvatski",
  hu: "Magyar",
  lt: "Lietuvių",
  lv: "Latviešu",
  nb: "Norsk",
  no: "Norsk",
  ro: "Română",
  sk: "Slovenčina",
  sl: "Slovenščina",
  sr: "Српски",
  sv: "Svenska",
  bg: "Български",
  bn: "বাংলা",
  te: "తెలుగు",
  ta: "தமிழ்",
  km: "ខ្មែរ",
  ur: "اردو",
  fa: "فارسی",
};

// ISO 639-2/3 and common non-standard codes -> ISO 639-1.
const ALIASES = {
  ind: "id", in: "id", eng: "en", spa: "es", sp: "es", por: "pt", tha: "th", vie: "vi", vn: "vi", jpn: "ja", jp: "ja",
  kor: "ko", kr: "ko", fra: "fr", fre: "fr", deu: "de", ger: "de", tur: "tr", ara: "ar", msa: "ms", may: "ms",
  fil: "tl", tgl: "tl", hin: "hi", rus: "ru", ita: "it", pol: "pl", nld: "nl", dut: "nl", heb: "he", iw: "he",
  swe: "sv", ces: "cs", cze: "cs", dan: "da", nor: "no", nob: "nb", fin: "fi", ell: "el", gre: "el", hun: "hu",
  ron: "ro", rum: "ro", ukr: "uk", est: "et", hrv: "hr", lit: "lt", lav: "lv", slk: "sk", slo: "sk", slv: "sl",
  srp: "sr", ben: "bn", tel: "te", tam: "ta", khm: "km", urd: "ur", fas: "fa", per: "fa", bul: "bg", cat: "ca",
  zho: "zh", chi: "zh", chs: "zh", cht: "zh", rtw: "zh", cn: "zh", tw: "zh", hk: "zh",
  indonesian: "id", indonesia: "id", english: "en", chinese: "zh", spanish: "es", portuguese: "pt", thai: "th",
  vietnamese: "vi", japanese: "ja", korean: "ko", french: "fr", german: "de", turkish: "tr", arabic: "ar",
  malay: "ms", filipino: "tl", hindi: "hi", russian: "ru", italian: "it",
};

// Native names ("Español", "中文", ...) back to their code.
const BY_NAME = Object.fromEntries(Object.entries(NAMES).map(([code, name]) => [name.toLowerCase(), code]));

/**
 * Upstream language tag (id_ID, ind, zh-Hans, pt-BR, "English", "Español", "Traditional Chinese", ...) -> lowercase
 * ISO-639-1 when possible; otherwise the tag itself, lowercased.
 */
export function canonLang(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return "";
  if (s === "bahasa indonesia") return "id";
  if (BY_NAME[s]) return BY_NAME[s];
  const words = s.split(/[-\s()]+/).filter(Boolean);
  const base = words[0];
  if (ALIASES[base]) return ALIASES[base];
  if (/^[a-z]{2}$/.test(base)) return base;
  const last = words[words.length - 1];
  if (ALIASES[last] && last.length > 3) return ALIASES[last];
  return s;
}

export const langName = (code) => (code === "und" ? "Lainnya" : NAMES[code] || code);

// A label that is only a code ("in", "eng", "zh-Hans") is replaced by the language name.
function labelFor(label, code) {
  const text = String(label ?? "").trim();
  if (!text || canonLang(text) === code || /^[a-z]{2,3}([-_][a-z0-9]{2,4})?$/i.test(text)) return langName(code);
  return text;
}

/**
 * Raw tracks [{ label?, language|lang, url }] (upstream urls) -> contract subtitles: language canonicalized,
 * first track per language kept, url proxied (the proxy serves .srt as WebVTT), sorted `wanted` first, then en, id, rest.
 */
export function subtitleList(tracks, wanted, base) {
  const seen = new Set();
  const out = [];
  for (const t of tracks || []) {
    if (!t?.url) continue;
    // No code: guess from the label; a track with neither is kept as "und" (undetermined) rather than dropped.
    const guess = canonLang(t.label);
    const code = canonLang(t.language ?? t.lang) || (/^[a-z]{2}$/.test(guess) ? guess : "und");
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ label: labelFor(t.label, code), language: code, url: proxify(base, t.url) });
  }
  const rank = (code) => (code === wanted ? 0 : code === "en" ? 1 : code === "id" ? 2 : 3);
  return out.sort((a, b) => rank(a.language) - rank(b.language));
}
