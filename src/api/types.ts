/** Mirrors docs/API_CONTRACT.md. Keep in sync with server/. */

export type SourceId = string; // "reelshort" | "dramabox" | "melolo" | "freereels" | ...

/** Content language (docs/LANG_CONTRACT.md). */
export type ContentLanguage = 'id' | 'en';

export interface Drama {
  /** Opaque; English-catalog items end in "~en". Always encodeURIComponent it. */
  id: string;
  source: SourceId;
  title: string;
  /** Vertical poster (3:4 / 9:16). Absolute URL. */
  cover: string;
  /** Optional wide image (16:9-ish) for hero banners. */
  banner?: string;
  description: string;
  tags: string[];
  totalEpisodes: number;
  /** 0 when unknown. */
  viewCount: number;
  isCompleted: boolean;
  /** Language of the item's content. */
  lang?: ContentLanguage;
}

export interface EpisodeRef {
  number: number;
  title: string;
  locked: boolean;
  thumb?: string;
}

export interface DramaDetail extends Drama {
  /** Always populated 1..totalEpisodes. */
  episodes: EpisodeRef[];
}

export interface Quality {
  label: string;
  url: string;
}

export interface Subtitle {
  label: string;
  /** Lowercase ISO-639-1 when known ("id", "en", "zh", …). */
  language: string;
  /** Proxy URL that always returns WebVTT. */
  url: string;
}

export type StreamType = 'hls' | 'mp4';

export interface EpisodePlay {
  source: SourceId;
  id: string;
  number: number;
  locked: boolean;
  /** Ready-to-play URL (via /api/proxy). */
  url: string;
  type: StreamType;
  qualities: Quality[];
  subtitles: Subtitle[];
}

export type SectionStyle = 'hero' | 'rank' | 'row' | 'grid';

export interface Section {
  key: string;
  title: string;
  style: SectionStyle;
  items: Drama[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

export type ListType = 'trending' | 'latest' | 'foryou';

export type SourceHealth = 'up' | 'down' | 'unknown';

export interface HealthResponse {
  ok: boolean;
  sources: Record<SourceId, SourceHealth>;
}

export interface SourceInfo {
  id: SourceId;
  name: string;
  healthy: boolean;
  /** Content languages the source offers. */
  langs?: ContentLanguage[];
}

export interface SourcesResponse {
  items: SourceInfo[];
}

export interface HomeResponse {
  sections: Section[];
}

export interface SearchResponse {
  items: Drama[];
}

export interface ApiErrorBody {
  error: string;
}
