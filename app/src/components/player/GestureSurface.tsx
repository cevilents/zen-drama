import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

export interface GestureSurfaceProps {
  width: number;
  onSingleTap: () => void;
  onDoubleTap: (side: 'left' | 'right') => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  children?: ReactNode;
}

/**
 * Full-page touch layer: tap (toggle UI), double-tap left/right (seek ∓10s), press-and-hold (2x).
 * Leaves vertical panning to the episode pager (web: `touch-action: pan-y`).
 */
export function GestureSurface({ width, onSingleTap, onDoubleTap, onHoldStart, onHoldEnd, children }: GestureSurfaceProps) {
  const hold = Gesture.LongPress()
    .minDuration(380)
    .maxDistance(14)
    .onStart(() => {
      scheduleOnRN(onHoldStart);
    })
    .onEnd(() => {
      scheduleOnRN(onHoldEnd);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .maxDistance(24)
    .onEnd((e, success) => {
      if (success) scheduleOnRN(onDoubleTap, e.x < width / 2 ? 'left' : 'right');
    });

  const singleTap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(12)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(onSingleTap);
    });

  const gesture = Gesture.Race(hold, Gesture.Exclusive(doubleTap, singleTap));

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y" userSelect="none">
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
