import { useSources } from '@/api/hooks';

const KNOWN: Record<string, string> = {
  reelshort: 'ReelShort',
  dramabox: 'DramaBox',
  melolo: 'Melolo',
  freereels: 'FreeReels',
  goodshort: 'GoodShort',
  idrama: 'iDrama',
  dramawave: 'DramaWave',
  shortmax: 'ShortMax',
  netshort: 'NetShort',
  flickreels: 'FlickReels',
};

/** Display name for a source id ("reelshort" → "ReelShort"). Uses /api/sources when cached. */
export function useSourceName(source: string | undefined): string {
  const { data } = useSources();
  if (!source) return '';
  const fromApi = data?.find((s) => s.id === source)?.name;
  return fromApi || KNOWN[source] || source.charAt(0).toUpperCase() + source.slice(1);
}
