export interface RewardedAdProps {
  /** Start loading and playing the ad as soon as this is true. */
  active: boolean;
  /**
   * The reward flow is over: the ad finished, or none could be shown. The caller should grant
   * the unlock — a missing ad must never block the user.
   */
  onDone: () => void;
}
