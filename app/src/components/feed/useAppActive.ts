import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}

/** Anything but an explicit background/inactive state counts as active (web: tab visible). */
function getSnapshot(): boolean {
  const s = AppState.currentState;
  return s !== 'background' && s !== 'inactive';
}

/** True while the app is foregrounded (native) or the tab is visible (web). */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
