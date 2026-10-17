import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { startServerDiscovery } from '@/api';
import { ToastHost } from '@/components/ui/Toast';
import { limitVideoCache } from '@/components/video/cacheLimit';
import { queryClient } from '@/lib/queryClient';
import { ShareSheet } from '@/components/share/ShareSheet';
import { captureReferral } from '@/lib/ref';
import { useStoresHydrated, useToast } from '@/store';
import { colors } from '@/theme';

// Before any screen can create a player (the call throws once one exists).
limitVideoCache();

SplashScreen.preventAutoHideAsync().catch(() => {});
// Expo Go doesn't support splash options and logs a warning.
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ duration: 250, fade: true });
}

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

/**
 * iOS presents fullScreenModal screens and RN <Modal>s above the root view, hiding toasts.
 * FullWindowOverlay attaches to the window only when it mounts, so it would sit under any
 * modal presented later: re-key it per toast so each new toast mounts on top. The key only
 * moves forward (kept while the toast hides) so the exit animation still plays.
 */
function ToastLayer() {
  const toastId = useToast((s) => s.current?.id ?? null);
  const [overlayKey, setOverlayKey] = useState(toastId);
  if (toastId !== null && toastId !== overlayKey) setOverlayKey(toastId);

  if (Platform.OS !== 'ios') return <ToastHost />;
  return (
    <FullWindowOverlay key={overlayKey ?? 'idle'}>
      <ToastHost />
    </FullWindowOverlay>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Persisted stores (server URL, history, library) must be loaded before the first screen
  // fires queries or reads progress; useStoresHydrated has a timeout fallback so this can't hang.
  const hydrated = useStoresHydrated();
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = colors.bg;
      document.body.style.backgroundColor = colors.bg;
      document.documentElement.style.colorScheme = 'dark';
      captureReferral();
    }
  }, []);

  // Non-blocking: first render uses the last discovered address; the lookup updates it if it moved.
  useEffect(() => {
    if (hydrated) return startServerDiscovery();
  }, [hydrated]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navTheme}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'slide_from_right',
                animationDuration: 280,
              }}>
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="drama/[source]/[id]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="watch/[source]/[id]"
                options={{
                  presentation: 'fullScreenModal',
                  animation: 'fade',
                  contentStyle: { backgroundColor: colors.black },
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen name="+not-found" options={{ animation: 'fade' }} />
            </Stack>
            <ToastLayer />
            <ShareSheet />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
