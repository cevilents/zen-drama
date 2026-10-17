import type { PlaybackRate } from '@/store';

/** 1 -> "1x", 1.25 -> "1,25x" (Indonesian decimal comma). */
export function formatRate(rate: PlaybackRate): string {
  return `${String(rate).replace('.', ',')}x`;
}

/** "auto" -> "Otomatis", otherwise the label as-is ("1080p"). */
export function formatQuality(q: string): string {
  return q === 'auto' ? 'Otomatis' : q;
}
