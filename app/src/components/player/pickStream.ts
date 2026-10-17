import type { EpisodePlay, Quality, StreamType } from '@/api/types';

export interface PickedStream {
  uri: string;
  type: StreamType;
}

/**
 * The stream an episode plays for the preferred quality: the matching quality's URL, else the default
 * one. `stream` is null when the endpoint gave no URL (locked). Shared by the player and the next-episode
 * preloader so both request the same URL (the video cache is keyed by it).
 */
export function pickStream(
  data: EpisodePlay,
  preferredQuality: string,
): { quality: Quality | undefined; stream: PickedStream | null } {
  const quality = data.qualities.find((q) => q.label === preferredQuality);
  return { quality, stream: data.url ? { uri: quality?.url ?? data.url, type: data.type } : null };
}
