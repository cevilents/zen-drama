import type { Drama, EpisodeRef } from '@/api/types';

/**
 * Compact Indonesian view counts.
 * 950 → "950", 12_400 → "12,4 rb", 1_250_000 → "1,3 jt", 2_100_000_000 → "2,1 M"
 */
export function formatViews(n: number | null | undefined): string {
  if (!n || n < 0 || !Number.isFinite(n)) return '0';
  const fmt = (v: number) => {
    const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return String(rounded).replace('.', ',');
  };
  if (n >= 1e9) return `${fmt(n / 1e9)} M`;
  if (n >= 1e6) return `${fmt(n / 1e6)} jt`;
  if (n >= 1e3) return `${fmt(n / 1e3)} rb`;
  return String(Math.round(n));
}

/** 750 → "12:30", 3725 → "1:02:05". Invalid → "0:00". */
export function formatDuration(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

export interface EpisodeRangeTab {
  /** "1-30" */
  label: string;
  start: number;
  end: number;
}

/** Split `total` episodes into tabs of `size`: 80 → [1-30, 31-60, 61-80]. */
export function episodeRangeTabs(total: number, size = 30): EpisodeRangeTab[] {
  if (!total || total <= 0) return [];
  const tabs: EpisodeRangeTab[] = [];
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(start + size - 1, total);
    tabs.push({ label: start === end ? `${start}` : `${start}-${end}`, start, end });
  }
  return tabs;
}

/**
 * Single source of truth for a drama's episode count: the larger of the declared total and the
 * episode list we actually received (sources disagree; either may be 0 when unknown).
 */
export function episodeCount(drama: Pick<Drama, 'totalEpisodes'> & { episodes?: EpisodeRef[] }): number {
  return Math.max(drama.episodes?.length ?? 0, drama.totalEpisodes || 0);
}

/** "80 Episode" / "Tamat · 80 Episode" */
export function formatEpisodeCount(total: number, completed?: boolean): string {
  const base = `${total} Episode`;
  return completed ? `Tamat · ${base}` : base;
}

/** Fraction 0..1 safe for progress bars. */
export function progressRatio(position: number, duration: number): number {
  if (!duration || duration <= 0 || !Number.isFinite(position)) return 0;
  return Math.min(1, Math.max(0, position / duration));
}
