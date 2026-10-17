import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useEffectEvent, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BannerAd } from '@/components/ads/BannerAd';
import { AppText } from '@/components/ui/AppText';
import { GradientButton } from '@/components/ui/GradientButton';
import { consumeDailyFree, dailyFreeLeft, escalateWait, waitSeconds } from '@/lib/unlock';
import { colors, radii, spacing } from '@/theme';

import { RewardedAd } from './RewardedAd';
import type { EpisodeGateProps } from './EpisodeGate.types';

/** Monetag Direct Link: opened for the free (sponsored) unlock option. */
const DIRECT_LINK = 'https://uplcm.com/4/12011392';

/** Web-only gate shown instead of the player for episodes past the free set. */
export function EpisodeGate({ dramaKey, episode, width, height, onUnlock }: EpisodeGateProps) {
  const [mode, setMode] = useState<'gate' | 'ad'>('gate');
  const [waitLeft, setWaitLeft] = useState<number | null>(null);
  const [dailyLeft, setDailyLeft] = useState(dailyFreeLeft);
  const [waitTotal] = useState(() => waitSeconds(dramaKey));

  const unlock = useEffectEvent(() => onUnlock());
  const waiting = waitLeft != null;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setWaitLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (waitLeft == null || waitLeft > 0) return;
    escalateWait(dramaKey);
    unlock();
  }, [waitLeft, dramaKey]);

  if (mode === 'ad') {
    return (
      <View style={[styles.root, { width, height }]}>
        <RewardedAd active onDone={onUnlock} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { width, height }]}>
      <View style={styles.content}>
        <LinearGradient
          colors={['rgba(245,184,65,0.32)', 'rgba(224,155,45,0.04)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.halo}>
          <View style={styles.haloInner}>
            <Ionicons name="lock-closed" size={30} color={colors.gold} />
          </View>
        </LinearGradient>
        <AppText variant="overline" color="gold" align="center">
          EP {episode} terkunci
        </AppText>
        <AppText variant="h2" align="center" style={styles.title}>
          Tonton iklan untuk lanjut
        </AppText>
        <AppText variant="bodySm" color="textSecondary" align="center" style={styles.message}>
          Buka episode ini dengan menonton satu iklan singkat, atau tunggu sebentar.
        </AppText>
        <View style={styles.actions}>
          <GradientButton label="Tonton iklan" icon="play" onPress={() => setMode('ad')} fullWidth />
          {waiting ? (
            <View style={styles.waitPill}>
              <AppText variant="label" weight="bold" tabular>
                Menunggu… {waitLeft}s
              </AppText>
            </View>
          ) : (
            <GradientButton
              label={`Tunggu ${waitTotal}s`}
              icon="time-outline"
              variant="secondary"
              onPress={() => setWaitLeft(waitTotal)}
              fullWidth
            />
          )}
          {dailyLeft > 0 && (
            <Pressable
              onPress={() => {
                window.open(DIRECT_LINK, '_blank', 'noopener,noreferrer');
                consumeDailyFree();
                setDailyLeft(dailyLeft - 1);
                onUnlock();
              }}>
              <AppText variant="caption" color="gold" align="center">
                Buka gratis — lihat sponsor ({dailyLeft} tersisa hari ini)
              </AppText>
            </Pressable>
          )}
        </View>
        {waiting && <BannerAd style={styles.gateAd} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  content: { width: '100%', maxWidth: 340, alignItems: 'center', paddingHorizontal: spacing[8] },
  halo: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  haloInner: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,184,65,0.35)',
  },
  title: { marginTop: spacing[2] },
  message: { marginTop: spacing[2] },
  actions: { alignSelf: 'stretch', gap: spacing[3], marginTop: spacing[6], alignItems: 'center' },
  gateAd: { alignSelf: 'stretch', marginTop: spacing[6], marginHorizontal: spacing[4] },
  waitPill: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
