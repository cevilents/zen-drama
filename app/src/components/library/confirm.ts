import { Alert, Platform } from 'react-native';

export interface ConfirmDestructiveOptions {
  title: string;
  message: string;
  /** Label of the destructive button. Default "Hapus". */
  confirmLabel?: string;
  /** Label of the cancel button. Default "Batal". */
  cancelLabel?: string;
}

/**
 * Cross-platform destructive confirmation.
 * Native: `Alert.alert` with a destructive button · Web: `window.confirm`. Resolves true when confirmed.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
}: ConfirmDestructiveOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(`${title}\n\n${message}`) : false;
    return Promise.resolve(ok);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
