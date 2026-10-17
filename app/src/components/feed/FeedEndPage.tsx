import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing } from '@/theme';

import { FeedSkeleton } from './FeedSkeleton';

export interface FeedEndPageProps {
  height: number;
  bottomSpace: number;
  /** "more" = next page loading (or failed), "end" = no more items. */
  kind: 'more' | 'end';
  error?: unknown;
  onRetry: () => void;
}

/** Trailing page of the vertical feed: loading/failed next page, or the end-of-feed card. */
export function FeedEndPage({ height, bottomSpace, kind, error, onRetry }: FeedEndPageProps) {
  if (kind === 'more' && !error) return <FeedSkeleton height={height} bottomSpace={bottomSpace} />;

  return (
    <View style={[styles.root, { height, paddingBottom: bottomSpace }]}>
      {kind === 'more' ? (
        <ErrorState error={error} title="Gagal memuat cuplikan berikutnya" onRetry={onRetry} />
      ) : (
        <EmptyState
          icon="checkmark-done-circle-outline"
          tone="gold"
          title="Kamu sudah sampai ujung"
          message="Semua cuplikan sudah kamu lihat. Muat ulang untuk rekomendasi baru, atau jelajahi Beranda."
          actionLabel="Muat ulang"
          actionIcon="refresh"
          onAction={onRetry}
          footer={
            <GradientButton
              label="Jelajahi Beranda"
              icon="compass-outline"
              variant="ghost"
              size="md"
              onPress={() => router.navigate('/')}
              style={styles.secondary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', backgroundColor: colors.bg, justifyContent: 'center' },
  secondary: { marginTop: spacing[2], alignSelf: 'center' },
});
