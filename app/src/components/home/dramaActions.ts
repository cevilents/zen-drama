import { router } from 'expo-router';

import type { Drama } from '@/api/types';
import { haptics } from '@/lib/haptics';
import { dramaHref, watchHref } from '@/lib/routes';
import { toast } from '@/store';
import { useHistory } from '@/store/useHistory';
import { useLibrary } from '@/store/useLibrary';

/** Episode to resume: last watched episode from history, else 1. */
export function resumeEpisode(drama: Pick<Drama, 'source' | 'id'>): number {
  return useHistory.getState().getEntry(drama.source, drama.id)?.lastEpisode ?? 1;
}

/** Open the player at the resume episode. */
export function playDrama(drama: Drama) {
  router.push(watchHref(drama.source, drama.id, resumeEpisode(drama)));
}

export function openDetail(drama: Drama) {
  router.push(dramaHref(drama));
}

/** Toggle "Daftarku" with toast + haptic feedback. Returns the new state. */
export function toggleFavorite(drama: Drama): boolean {
  const added = useLibrary.getState().toggleFavorite(drama);
  if (added) {
    haptics.success();
    toast.show('Ditambahkan ke Daftarku', { variant: 'favorite' });
  } else {
    haptics.light();
    toast.show('Dihapus dari Daftarku', { icon: 'heart-dislike-outline' });
  }
  return added;
}
