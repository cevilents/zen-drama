import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/navigation/TabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'fade',
        lazy: true,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Untukmu', sceneStyle: { backgroundColor: colors.black } }}
      />
      <Tabs.Screen name="search" options={{ title: 'Cari' }} />
      <Tabs.Screen name="library" options={{ title: 'Daftarku' }} />
      <Tabs.Screen name="profile" options={{ title: 'Pengaturan' }} />
    </Tabs>
  );
}
