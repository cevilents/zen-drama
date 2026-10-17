import type { Href } from 'expo-router';

import type { Drama, ListType } from '@/api/types';
import type { IoniconName } from '@/components/ui/IconButton';

/** Audience / format tags that say nothing about the story. Hidden from hero + chips. */
const GENERIC_TAGS = new Set(
  [
    'pria',
    'perempuan',
    'wanita',
    'laki-laki',
    'seri',
    'semua usia',
    'pemuda',
    'remaja',
    'dewasa',
    'drama',
    'modern',
    'sulih suara',
  ].map((t) => t.toLowerCase()),
);

/** Up to `max` story tags ("Romansa", "CEO", ...), generic audience tags dropped. */
export function storyTags(drama: Pick<Drama, 'tags'>, max = 2): string[] {
  const out: string[] = [];
  for (const raw of drama.tags) {
    const tag = raw.trim();
    if (!tag || GENERIC_TAGS.has(tag.toLowerCase())) continue;
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export const LIST_TYPES: readonly ListType[] = ['trending', 'latest', 'foryou'];

export function isListType(v: unknown): v is ListType {
  return typeof v === 'string' && (LIST_TYPES as readonly string[]).includes(v);
}

export const LIST_TITLES: Record<ListType, string> = {
  trending: 'Sedang Trending',
  latest: 'Rilis Terbaru',
  foryou: 'Pilihan Untukmu',
};

export const LIST_ICONS: Record<ListType, IoniconName> = {
  trending: 'flame',
  latest: 'sparkles',
  foryou: 'heart',
};

/** Source used when a cross-source section ("trending") opens "Lihat semua". */
export const FALLBACK_SOURCE = 'reelshort';

/**
 * Maps a home section key to a browsable list.
 * "reelshort:trending" → { source: reelshort, type: trending }
 * "trending" (cross-source) → fallback source; the browse screen lets the user switch source.
 * Shelf / grid / custom keys → null (no "Lihat semua").
 */
export function sectionToList(key: string, fallbackSource = FALLBACK_SOURCE): { source: string; type: ListType } | null {
  const parts = key.split(':');
  if (parts.length === 1 && isListType(parts[0])) return { source: fallbackSource, type: parts[0] };
  if (parts.length === 2 && parts[0] && isListType(parts[1])) return { source: parts[0], type: parts[1] };
  return null;
}

export function browseHref(source: string, type: ListType): Href {
  return { pathname: '/browse/[source]/[type]', params: { source, type } };
}

/** Leading glyph for a home section header. */
export function sectionIcon(key: string): IoniconName | undefined {
  // Only the cross-source headline rows get a glyph; per-source rows stay quiet.
  if (isListType(key)) return LIST_ICONS[key];
  if (key === 'romance') return 'rose';
  return undefined;
}

export interface Genre {
  label: string;
  /** Search keyword sent to /search. */
  query: string;
  icon: IoniconName;
}

export const GENRES: readonly Genre[] = [
  { label: 'Romansa', query: 'Romansa', icon: 'heart' },
  { label: 'CEO', query: 'CEO', icon: 'briefcase' },
  { label: 'Balas Dendam', query: 'Balas Dendam', icon: 'flash' },
  { label: 'Pernikahan Kontrak', query: 'Pernikahan Kontrak', icon: 'document-text' },
  { label: 'Miliarder', query: 'Miliarder', icon: 'diamond' },
  { label: 'Keluarga', query: 'Keluarga', icon: 'people' },
  { label: 'Fantasi', query: 'Fantasi', icon: 'sparkles' },
  { label: 'Sejarah', query: 'Sejarah', icon: 'hourglass' },
];

/** Search tab with a prefilled query. `t` forces a re-sync when the same query is tapped twice. */
export function searchHref(q: string): Href {
  return { pathname: '/search', params: { q, t: String(Date.now()) } };
}
