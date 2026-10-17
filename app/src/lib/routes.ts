import type { Href } from 'expo-router';

import type { Drama } from '@/api/types';

/** Detail screen: `/drama/[source]/[id]`. */
export function dramaHref(d: Pick<Drama, 'source' | 'id'>): Href {
  return {
    pathname: '/drama/[source]/[id]',
    params: { source: d.source, id: d.id },
  };
}

/** Player: `/watch/[source]/[id]?ep=N`. */
export function watchHref(source: string, id: string, ep = 1): Href {
  return {
    pathname: '/watch/[source]/[id]',
    params: { source, id, ep: String(ep) },
  };
}
