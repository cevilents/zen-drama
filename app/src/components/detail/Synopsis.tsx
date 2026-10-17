import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { spacing } from '@/theme';

/** Line counts can't be measured reliably on web, so only long texts get the toggle. */
const LONG_TEXT = 140;
const COLLAPSED_LINES = 3;

export interface SynopsisProps {
  text: string;
}

export function Synopsis({ text }: SynopsisProps) {
  const [expanded, setExpanded] = useState(false);
  const body = text.trim();
  if (!body) return null;

  const long = body.length > LONG_TEXT;

  return (
    <View>
      <AppText variant="h3" accessibilityRole="header">
        Sinopsis
      </AppText>
      <AppText
        variant="body"
        color="textSecondary"
        numberOfLines={long && !expanded ? COLLAPSED_LINES : undefined}
        style={styles.body}>
        {body}
      </AppText>
      {long && (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          haptic="selection"
          accessibilityLabel={expanded ? 'Tampilkan lebih sedikit sinopsis' : 'Baca sinopsis selengkapnya'}
          accessibilityState={{ expanded }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.toggle}>
          <AppText variant="label" color="primary">
            {expanded ? 'Lebih sedikit' : 'Selengkapnya'}
          </AppText>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing[2] },
  toggle: { alignSelf: 'flex-start', marginTop: spacing[2], paddingVertical: spacing[1] },
});
