import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'error' | 'favorite';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  /** Ionicons glyph name override. */
  icon?: string;
  durationMs: number;
}

export interface ToastOptions {
  variant?: ToastVariant;
  icon?: string;
  durationMs?: number;
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, opts?: ToastOptions) => void;
  hide: () => void;
}

let seq = 0;

export const useToast = create<ToastState>()((set) => ({
  current: null,
  show: (message, opts) =>
    set({
      current: {
        id: ++seq,
        message,
        variant: opts?.variant ?? 'default',
        icon: opts?.icon,
        durationMs: opts?.durationMs ?? 2200,
      },
    }),
  hide: () => set({ current: null }),
}));

/** Global imperative API: `toast.show('Ditambahkan ke Daftarku', { variant: 'favorite' })`. */
export const toast = {
  show: (message: string, opts?: ToastOptions) => useToast.getState().show(message, opts),
  success: (message: string, opts?: Omit<ToastOptions, 'variant'>) =>
    useToast.getState().show(message, { ...opts, variant: 'success' }),
  error: (message: string, opts?: Omit<ToastOptions, 'variant'>) =>
    useToast.getState().show(message, { ...opts, variant: 'error' }),
  hide: () => useToast.getState().hide(),
};
