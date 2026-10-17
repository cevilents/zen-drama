import { Platform, Share } from 'react-native';

import type { Drama } from '@/api/types';
import { useShareSheet } from '@/store/useShareSheet';

/** Canonical origin for shared links (the workers.dev host is not meant to be shared). */
const SHARE_ORIGIN = 'https://zendrama.web.id';

type ShareableDrama = Pick<Drama, 'title' | 'totalEpisodes' | 'source' | 'id'>;

function shareUrl(drama: ShareableDrama, episode?: number): string {
  const tag = 'utm_source=share';
  const path = `${encodeURIComponent(drama.source)}/${encodeURIComponent(drama.id)}`;
  return episode
    ? `${SHARE_ORIGIN}/watch/${path}?ep=${episode}&${tag}`
    : `${SHARE_ORIGIN}/drama/${path}?${tag}`;
}

/**
 * Share a drama (optionally a specific episode). Uses the OS/Web Share sheet when available; on
 * browsers without it, opens the in-app share menu so the user can pick a channel.
 */
export async function shareDrama(drama: ShareableDrama, episode?: number): Promise<void> {
  const url = shareUrl(drama, episode);
  const what = episode ? `EP ${episode} "${drama.title}"` : `"${drama.title}"`;
  const message = `Lagi nonton ${what} di ZEN DRAMA — ${drama.totalEpisodes} episode drama pendek seru. Yuk nonton bareng!`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: drama.title, text: message, url });
      } catch {
        // User dismissed the share sheet.
      }
      return;
    }
    useShareSheet.getState().open({ title: drama.title, url, message });
    return;
  }

  try {
    await Share.share({ title: drama.title, message: `${message}\n${url}` });
  } catch {
    // User dismissed the share sheet — nothing to report.
  }
}
