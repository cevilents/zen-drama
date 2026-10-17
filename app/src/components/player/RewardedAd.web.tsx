import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { fetchVastAd, firePixel, type VastAd } from '@/lib/vast';
import { colors, radii, spacing } from '@/theme';

import type { RewardedAdProps } from './RewardedAd.types';

/** HilltopAds Video VAST tag used for the unlock ad. Swap for a rewarded zone tag when available. */
const AD_TAG_URL =
  'https://loyal-product.com/dgmdFUzid.GVNKvRZEGvUE/meTm/9_uWZnUOl/kSPtTOct1/MnTYAp5ZNPzVMRtnNPzOUnx/MpDckl3QNQww';
/** Give up on a slow tag rather than leave the user staring at a loading label. */
const FETCH_TIMEOUT_MS = 4000;

/**
 * Web-only non-skippable VAST ad used to unlock an episode. Plays in its own overlay <video>;
 * if the tag or media fails, it still resolves (fail-open) so a broken ad can't trap the user.
 */
export function RewardedAd({ active, onDone }: RewardedAdProps) {
  const [ad, setAd] = useState<VastAd | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const settled = useRef(false);

  const finish = useEffectEvent(() => {
    if (settled.current) return;
    settled.current = true;
    onDone();
  });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let cancelled = false;
    fetchVastAd(AD_TAG_URL, controller.signal)
      .then((found) => {
        if (cancelled) return;
        clearTimeout(timer);
        if (found) setAd(found);
        else finish();
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timer);
        finish();
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!ad || !video) return;
    video.src = ad.mediaUrl;
    ad.impressionUrls.forEach(firePixel);
    const onError = () => {
      firePixel(ad.errorUrl);
      finish();
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', onError);
    // Backstop: hand the reward over even if the ad video stalls.
    const guard = setTimeout(finish, ((ad.durationSec > 0 ? ad.durationSec : 45) + 5) * 1000);
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(onError);
    });
    return () => {
      clearTimeout(guard);
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', onError);
    };
  }, [ad]);

  if (!active) return null;

  return (
    <View style={styles.overlay}>
      {ad ? (
        <video ref={videoRef} playsInline controls={false} disablePictureInPicture style={videoStyle} />
      ) : (
        <AppText variant="bodySm" color="textSecondary">
          Memuat iklan…
        </AppText>
      )}
      <View style={styles.badge} pointerEvents="none">
        <AppText variant="caption" weight="bold">
          Iklan
        </AppText>
      </View>
      <View style={styles.hint} pointerEvents="none">
        <AppText variant="caption" color="rgba(255,255,255,0.85)">
          Tonton sampai selesai untuk membuka episode
        </AppText>
      </View>
    </View>
  );
}

const videoStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  backgroundColor: colors.black,
  display: 'block',
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  badge: {
    position: 'absolute',
    top: spacing[3],
    left: spacing[3],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hint: {
    position: 'absolute',
    bottom: spacing[6],
    left: spacing[4],
    right: spacing[4],
    alignItems: 'center',
  },
});
