import { type StyleProp, type ViewStyle } from 'react-native';

import { isApiError, isUnreachableError } from '@/api/client';

import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  /** The error from React Query (`query.error`). Used to pick the message. */
  error?: unknown;
  /** Override the title. */
  title?: string;
  /** Override the message. */
  message?: string;
  /** Shows "Coba lagi". Usually `() => query.refetch()`. */
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

function describe(error: unknown): { title: string; message: string; unreachable: boolean } {
  if (isUnreachableError(error)) {
    return {
      title: 'Tidak bisa terhubung',
      message: 'Layanan sedang tidak tersedia. Periksa koneksi internetmu lalu coba lagi.',
      unreachable: true,
    };
  }
  if (isApiError(error) && error.kind === 'timeout') {
    return {
      title: 'Terlalu lama menunggu',
      message: 'Sumber konten lambat merespons atau sedang sibuk. Coba lagi sebentar.',
      unreachable: false,
    };
  }
  if (isApiError(error) && error.kind === 'http') {
    if (error.status === 404) {
      return { title: 'Tidak ditemukan', message: 'Konten ini tidak tersedia atau sudah dihapus.', unreachable: false };
    }
    return {
      title: 'Sumber sedang bermasalah',
      message: 'Sumber drama sedang sibuk. Tunggu sebentar lalu coba lagi.',
      unreachable: false,
    };
  }
  return {
    title: 'Ups, ada yang salah',
    message: 'Gagal memuat konten. Periksa koneksi internetmu lalu coba lagi.',
    unreachable: false,
  };
}

/** Friendly Indonesian error with retry. */
export function ErrorState({ error, title, message, onRetry, compact, style }: ErrorStateProps) {
  const d = describe(error);

  return (
    <EmptyState
      icon={d.unreachable ? 'cloud-offline-outline' : 'alert-circle-outline'}
      tone={d.unreachable ? 'gold' : 'primary'}
      title={title ?? d.title}
      message={message ?? d.message}
      actionLabel={onRetry ? 'Coba lagi' : undefined}
      actionIcon="refresh"
      onAction={onRetry}
      compact={compact}
      style={style}
    />
  );
}
