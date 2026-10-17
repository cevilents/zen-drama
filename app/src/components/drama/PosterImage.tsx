import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageContentFit } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

export interface PosterImageProps {
  uri: string | null | undefined;
  /** Width / height. Default 3/4 (vertical poster). Pass undefined + explicit height via style to opt out. */
  aspectRatio?: number;
  radius?: number;
  contentFit?: ImageContentFit;
  /** Crossfade ms. Default 250. */
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  /** Alt text, usually the drama title. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Overlays rendered above the image (gradients, badges). */
  children?: ReactNode;
  /** Blur radius for backdrop usage (e.g. blurred background behind detail hero). */
  blurRadius?: number;
}

/** expo-image poster with surface-colored placeholder, crossfade and a graceful broken-image state. */
export function PosterImage(props: PosterImageProps) {
  const {
    uri,
    radius = radii.md,
    contentFit = 'cover',
    transition = 250,
    priority = 'normal',
    accessibilityLabel,
    style,
    children,
    blurRadius,
  } = props;
  // An explicit `aspectRatio={undefined}` opts out; a default parameter would silently turn it into 3/4.
  const aspectRatio = 'aspectRatio' in props ? props.aspectRatio : 3 / 4;
  // Remember which uri failed, so a new uri (recycled list cell, new episode) gets a fresh try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showFallback = !uri || failedUri === uri;

  return (
    <View style={[styles.base, { borderRadius: radius, aspectRatio }, style]}>
      {showFallback ? (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Ionicons name="film-outline" size={28} color={colors.textMuted} />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={transition}
          priority={priority}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          blurRadius={blurRadius}
          accessible={!!accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailedUri(uri)}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
