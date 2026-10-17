import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Label of the destructive button. Default "Hapus". */
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Cross-platform destructive confirmation: native `Alert` on iOS/Android,
 * `window.confirm` on web (where `Alert.alert` with buttons is a no-op).
 */
export function confirmDestructive({ title, message, confirmLabel = 'Hapus', onConfirm }: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Batal', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
