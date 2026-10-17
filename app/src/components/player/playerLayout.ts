import { layout, spacing } from '@/theme';

/** Shared geometry so the inactive poster page lines up with the live player overlay. */
export const playerLayout = {
  gutter: layout.gutter,
  /** Space reserved on the right of the caption for the action rail. */
  railWidth: 72,
  /** Height of the scrubber row (hit area). */
  scrubberHeight: 32,
  bottomPad: (insetBottom: number) => Math.max(insetBottom, spacing[2]) + spacing[1],
  /** The caption sits above the time row + scrubber. */
  captionBottom: (insetBottom: number) => Math.max(insetBottom, spacing[2]) + spacing[1] + 32 + 18 + spacing[2],
} as const;
