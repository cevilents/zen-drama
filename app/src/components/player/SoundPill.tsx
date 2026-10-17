import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GlassView } from '@/components/ui/GlassView';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, spacing, zIndex } from '@/theme';

/** Web: the browser forced muted autoplay — one tap restores sound. */
export function SoundPill({ top, onPress }: { top: number; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" style={[styles.host, { top }]}>
      <FadeIn>
        <PressableScale onPress={onPress} accessibilityLabel="Nyalakan suara" activeScale={0.95}>
          <GlassView style={styles.pill} intensity={40} tint="rgba(20,20,26,0.8)">
            <Ionicons name="volume-mute" size={16} color={colors.white} />
            <AppText variant="label">Ketuk untuk menyalakan suara</AppText>
          </GlassView>
        </PressableScale>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: zIndex.overlay },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2.5],
    paddingHorizontal: spacing[4],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
