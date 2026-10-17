import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import type { Drama } from '@/api/types';
import { useShareSheet } from '@/store/useShareSheet';
import { toast } from '@/store/useToast';

/** Canonical origin so shares never point at the workers.dev host. */
const SHARE_ORIGIN = 'https://zendrama.web.id';

function shareText(drama: Drama): string {
  const eps = drama.totalEpisodes > 0 ? ` (${drama.totalEpisodes} episode)` : '';
  return `Nonton "${drama.title}"${eps} di ZEN DRAMA`;
}

/**
 * Share a drama. Uses the OS/Web Share sheet when available; on browsers without it, opens the
 * in-app share menu. Native uses the OS share sheet.
 */
export async function shareDrama(drama: Drama): Promise<void> {
  const path = `/drama/${encodeURIComponent(drama.source)}/${encodeURIComponent(drama.id)}?utm_source=share`;
  const url = `${SHARE_ORIGIN}${path}`;
  const message = shareText(drama);

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
    await Share.share({ title: drama.title, message: `${message}\n${Linking.createURL(path)}` });
  } catch {
    toast.error('Gagal membuka menu bagikan');
  }
}

