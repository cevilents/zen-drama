import { create } from 'zustand';

export interface SharePayload {
  title: string;
  url: string;
  message: string;
}

interface ShareSheetState {
  payload: SharePayload | null;
  open: (payload: SharePayload) => void;
  close: () => void;
}

/** Controls the web share menu shown when the OS share sheet (navigator.share) isn't available. */
export const useShareSheet = create<ShareSheetState>()((set) => ({
  payload: null,
  open: (payload) => set({ payload }),
  close: () => set({ payload: null }),
}));
