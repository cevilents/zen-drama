import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, gradients, radii } from '@/theme';

import { EqBars } from './EqBars';

export interface EpisodeTileProps {
  number: number;
  /** Tile edge length (tiles are square). */
  size: number;
  current?: boolean;
  watched?: boolean;
  locked?: boolean;
  /** Animate the eq-bars on the current tile. Default true. */
  playing?: boolean;
  /** Visual tone. "sheet" sits on surface (lighter idle fill). */
  tone?: 'page' | 'sheet';
  onPress?: (episode: number) => void;
}

const BORDER = 1.5;

/** Square episode number tile: idle / watched (dimmed + check) / current (gradient ring + eq-bars) / locked. */
export function EpisodeTile({
  number,
  size,
  current,
  watched,
  locked,
  playing = true,
  tone = 'page',
  onPress,
}: EpisodeTileProps) {
  const radius = radii.md;
  const idleFill = tone === 'sheet' ? colors.elevated : colors.surfaceAlt;
  const state = current ? 'sedang ditonton' : watched ? 'sudah ditonton' : locked ? 'terkunci' : '';
  const label = `Episode ${number}${state ? `, ${state}` : ''}`;
  const numberColor = current ? colors.white : watched ? colors.textSecondary : locked ? colors.textMuted : colors.text;

  const face = (
    <View
      style={[
        styles.face,
        { borderRadius: current ? radius - BORDER : radius, backgroundColor: current ? colors.surface : idleFill },
        watched && !current && styles.watchedFace,
      ]}>
      {current && (
        <LinearGradient
          colors={['rgba(255,45,85,0.28)', 'rgba(255,106,61,0.08)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <AppText
        variant="bodyMedium"
        weight={current ? 'extrabold' : 'bold'}
        color={numberColor}
        tabular
        style={[styles.number, size < 52 && styles.numberSm]}>
        {number}
      </AppText>

      {current && (
        <View style={styles.cornerBL}>
          <EqBars size={9} color={colors.primary} playing={playing} />
        </View>
      )}
      {locked && !current && !watched && (
        <View style={styles.cornerTR}>
          <Ionicons name="lock-closed" size={10} color={colors.gold} />
        </View>
      )}
      {watched && !current && (
        <View style={[styles.cornerTR, styles.check]}>
          <Ionicons name="checkmark" size={9} color={colors.textInverse} />
        </View>
      )}
    </View>
  );

  return (
    <PressableScale
      onPress={onPress ? () => onPress(number) : undefined}
      haptic="selection"
      activeScale={0.92}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!current }}
      style={{ width: size, height: size }}>
      {current ? (
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ring, { borderRadius: radius }]}>
          {face}
        </LinearGradient>
      ) : (
        face
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  ring: { flex: 1, padding: BORDER },
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  watchedFace: { opacity: 0.6 },
  number: { fontSize: 16, lineHeight: 20 },
  numberSm: { fontSize: 14, lineHeight: 18 },
  cornerBL: { position: 'absolute', left: 6, bottom: 6 },
  cornerTR: { position: 'absolute', top: 5, right: 5 },
  check: {
    width: 13,
    height: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
