import { useCallback, useEffect, useRef } from 'react';

import type { Drama } from '@/api/types';
import { useHistory } from '@/store/useHistory';

const SAVE_EVERY_MS = 5000;

/**
 * Throttled watch-progress persistence for one episode.
 * `report` on every progress tick (saves at most every 5s), `flush` on pause / end,
 * and a final save runs automatically on unmount (episode change, leaving the player).
 */
export function useProgressSaver(drama: Drama | undefined, episode: number) {
  const position = useRef(0);
  const duration = useRef(0);
  const lastSavedAt = useRef(0);
  /** Seconds actually played this session (seeks excluded) — decides whether a peek becomes the resume episode. */
  const watched = useRef(0);

  const flush = useCallback(
    (completed?: boolean) => {
      if (!drama) return;
      // Don't record an episode the viewer merely swiped past.
      if (!completed && position.current < 1) return;
      useHistory.getState().saveProgress({
        drama,
        episode,
        positionSec: position.current,
        durationSec: duration.current,
        completed,
        watchedSec: watched.current,
      });
      lastSavedAt.current = Date.now();
    },
    [drama, episode],
  );

  const report = useCallback(
    (positionSec: number, durationSec: number) => {
      const delta = positionSec - position.current;
      if (delta > 0 && delta < 2) watched.current += delta;
      position.current = positionSec;
      if (durationSec > 0) duration.current = durationSec;
      if (Date.now() - lastSavedAt.current >= SAVE_EVERY_MS) flush();
    },
    [flush],
  );

  useEffect(() => () => flush(), [flush]);

  return { report, flush };
}
