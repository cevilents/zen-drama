import type { Subtitle } from '@/api/types';
import type { ContentLang, SubtitleLang } from '@/store/useSettings';

/**
 * Subtitle picked in the playback sheet for the rest of this watch session: "off" or a track,
 * matched by language (and label when several tracks share one) on every following episode.
 */
export type SubtitleChoice = 'off' | { language: string; label: string };

const ALIASES: Record<string, string> = { in: 'id', ind: 'id', eng: 'en' };

/** "en-US" / "EN" / "eng" → "en"; "in"/"ind" → "id". */
export function normalizeLanguage(code: string): string {
  const base = code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return ALIASES[base] ?? base;
}

function byLanguage(subs: readonly Subtitle[], language: string): Subtitle | null {
  return subs.find((s) => normalizeLanguage(s.language) === language) ?? null;
}

/**
 * Track to show for an episode. A session choice wins when the episode offers it; otherwise the setting: "auto" = content
 * language, then English, then Indonesian; "id"/"en" = that track only; "off" = none.
 */
export function pickSubtitle(
  subs: readonly Subtitle[] | undefined,
  choice: SubtitleChoice | null,
  setting: SubtitleLang,
  contentLang: ContentLang,
): Subtitle | null {
  if (!subs?.length) return null;
  if (choice === 'off') return null;
  if (choice) {
    const language = normalizeLanguage(choice.language);
    const chosen =
      subs.find((s) => normalizeLanguage(s.language) === language && s.label === choice.label) ??
      byLanguage(subs, language);
    // The chosen language isn't offered for this episode: fall back to the setting.
    if (chosen) return chosen;
  }
  if (setting === 'off') return null;
  if (setting !== 'auto') return byLanguage(subs, setting);
  return byLanguage(subs, contentLang) ?? byLanguage(subs, 'en') ?? byLanguage(subs, 'id');
}
