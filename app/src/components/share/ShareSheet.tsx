import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { useShareSheet, type SharePayload } from '@/store/useShareSheet';
import { toast } from '@/store/useToast';
import { colors, radii, spacing } from '@/theme';

interface Channel {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  href: (payload: SharePayload) => string;
}

const CHANNELS: Channel[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp',
    color: '#25D366',
    href: (p) => `https://wa.me/?text=${encodeURIComponent(`${p.message}\n${p.url}`)}`,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    icon: 'paper-plane',
    color: '#2AABEE',
    href: (p) => `https://t.me/share/url?url=${encodeURIComponent(p.url)}&text=${encodeURIComponent(p.message)}`,
  },
  {
    key: 'x',
    label: 'X',
    icon: 'logo-twitter',
    color: '#e7e9ea',
    href: (p) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(p.message)}&url=${encodeURIComponent(p.url)}`,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    color: '#1877F2',
    href: (p) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(p.url)}`,
  },
];

/** Web share menu: explicit channels for browsers without the native share sheet. */
export function ShareSheet() {
  const payload = useShareSheet((s) => s.payload);
  const close = useShareSheet((s) => s.close);

  const openChannel = (channel: Channel) => {
    if (!payload) return;
    const href = channel.href(payload);
    close();
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(`${payload.message}\n${payload.url}`);
      toast.success('Link disalin');
    } catch {
      toast.error('Gagal menyalin tautan');
    }
    close();
  };

  return (
    <BottomSheet visible={!!payload} onClose={close} title="Bagikan">
      {payload && (
        <View style={styles.grid}>
          {CHANNELS.map((channel) => (
            <PressableScale
              key={channel.key}
              onPress={() => openChannel(channel)}
              style={styles.item}
              accessibilityRole="button"
              accessibilityLabel={`Bagikan ke ${channel.label}`}>
              <View style={[styles.icon, { borderColor: channel.color }]}>
                <Ionicons name={channel.icon} size={24} color={channel.color} />
              </View>
              <AppText variant="caption">{channel.label}</AppText>
            </PressableScale>
          ))}
          <PressableScale onPress={copyLink} style={styles.item} accessibilityRole="button" accessibilityLabel="Salin tautan">
            <View style={styles.icon}>
              <Ionicons name="link" size={24} color={colors.text} />
            </View>
            <AppText variant="caption">Salin link</AppText>
          </PressableScale>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4], paddingVertical: spacing[4] },
  item: { width: 72, alignItems: 'center', gap: spacing[1.5] },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
});
