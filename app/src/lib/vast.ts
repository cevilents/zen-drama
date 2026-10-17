// Web-only VAST 3.0 helper for the pre-roll ad overlay. The HilltopAds tag answers with
// Access-Control-Allow-Origin: *, so a plain fetch() works without an IMA SDK.

export interface VastAd {
  mediaUrl: string;
  durationSec: number;
  /** Show the skip button once currentTime passes this; null = not skippable. */
  skipAfterSec: number | null;
  impressionUrls: string[];
  errorUrl: string | null;
}

interface MediaChoice {
  url: string;
  mimeType: string;
  width: number;
  bitrate: number;
}

function pickMediaFile(ad: Element): string | null {
  const files: MediaChoice[] = Array.from(ad.querySelectorAll('MediaFile'))
    .map((node) => ({
      url: (node.textContent ?? '').trim(),
      mimeType: node.getAttribute('type') ?? '',
      width: Number(node.getAttribute('width')) || 0,
      bitrate: Number(node.getAttribute('bitrate')) || 0,
    }))
    .filter((file) => /^https?:/i.test(file.url));

  // MP4 first (broadest support); among those, the resolution closest to 720p, best bitrate as tiebreak.
  const mp4 = files.filter((file) => file.mimeType === 'video/mp4');
  const pool = mp4.length ? mp4 : files;
  if (!pool.length) return null;
  pool.sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280) || b.bitrate - a.bitrate);
  return pool[0].url;
}

function parseClock(value: string | null): number | null {
  if (!value) return null;
  const parts = value.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!parts) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return +parts[1] * 3600 + +parts[2] * 60 + +parts[3] + (parts[4] ? Number(`0.${parts[4]}`) : 0);
}

/** Fetch the tag and return the first playable inline linear ad, or null when there is none. */
export async function fetchVastAd(tagUrl: string, signal?: AbortSignal): Promise<VastAd | null> {
  const response = await fetch(tagUrl, { signal, credentials: 'omit' });
  if (!response.ok) return null;

  const doc = new DOMParser().parseFromString(await response.text(), 'text/xml');
  for (const ad of Array.from(doc.querySelectorAll('Ad'))) {
    const linear = ad.querySelector('Linear');
    const mediaUrl = pickMediaFile(ad);
    if (!linear || !mediaUrl) continue;

    return {
      mediaUrl,
      durationSec: parseClock(linear.querySelector('Duration')?.textContent ?? null) ?? 0,
      skipAfterSec: parseClock(linear.getAttribute('skipoffset')),
      impressionUrls: Array.from(linear.querySelectorAll('Impression'))
        .map((node) => (node.textContent ?? '').trim())
        .filter(Boolean),
      errorUrl: (linear.querySelector('Error')?.textContent ?? '').trim() || null,
    };
  }
  return null;
}

/** Fire a VAST tracking pixel without waiting for it. */
export function firePixel(url: string | null | undefined): void {
  if (!url || typeof window === 'undefined') return;
  const img = new window.Image();
  img.referrerPolicy = 'no-referrer';
  img.src = url;
}
