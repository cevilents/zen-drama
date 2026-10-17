import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { colors } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Tidak ditemukan' }} />
      <EmptyState
        icon="compass-outline"
        title="Halaman tidak ditemukan"
        message="Tautan ini mungkin salah atau sudah tidak berlaku."
        actionLabel="Kembali ke Beranda"
        actionIcon="home"
        onAction={() => router.replace('/')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
