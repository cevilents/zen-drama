export interface EpisodeGateProps {
  /** `${source}:${id}` — scopes unlock + wait persistence to this drama. */
  dramaKey: string;
  episode: number;
  width: number;
  height: number;
  /** The user earned the unlock (watched the ad, waited, or used the daily free one). */
  onUnlock: () => void;
}
