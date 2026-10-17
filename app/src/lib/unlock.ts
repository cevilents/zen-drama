// Web-only "watch ad to unlock" gate for episodes past the free set. All state lives in
// localStorage so unlocks persist per drama and the daily bonus resets each day.

/** Episodes 1..FREE_EPISODES always play without a gate (the free hook). */
const FREE_EPISODES = 5;
/** Gated episodes that can be opened for free each day, on top of the free set. */
const DAILY_FREE = 1;
/** Wait option, in seconds; grows by STEP after each completed wait so ads look better. */
const WAIT_BASE_SEC = 90;
const WAIT_STEP_SEC = 45;
const WAIT_MAX_SEC = 300;

const UNLOCK_PREFIX = 'zd:unlock:';
const WAIT_PREFIX = 'zd:wait:';
const DAILY_KEY = 'zd:unlock:daily';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): gates simply never persist.
  }
}

function unlockedSet(dramaKey: string): Set<number> {
  const raw = readLocal(UNLOCK_PREFIX + dramaKey);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

/** Whether the watch screen should show the gate for this episode. */
export function isGated(dramaKey: string, episode: number): boolean {
  return episode > FREE_EPISODES && !unlockedSet(dramaKey).has(episode);
}

export function unlockEpisode(dramaKey: string, episode: number): void {
  const set = unlockedSet(dramaKey);
  set.add(episode);
  writeLocal(UNLOCK_PREFIX + dramaKey, JSON.stringify([...set]));
}

/** Current wait length for this drama, escalating after each completed wait. */
export function waitSeconds(dramaKey: string): number {
  const stored = Number(readLocal(WAIT_PREFIX + dramaKey) ?? 0);
  return stored > 0 ? Math.min(WAIT_MAX_SEC, stored) : WAIT_BASE_SEC;
}

export function escalateWait(dramaKey: string): void {
  writeLocal(WAIT_PREFIX + dramaKey, String(Math.min(WAIT_MAX_SEC, waitSeconds(dramaKey) + WAIT_STEP_SEC)));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyUsed(): number {
  const raw = readLocal(DAILY_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { date: string; used: number };
    return parsed.date === today() ? parsed.used : 0;
  } catch {
    return 0;
  }
}

export function dailyFreeLeft(): number {
  return Math.max(0, DAILY_FREE - dailyUsed());
}

export function consumeDailyFree(): void {
  writeLocal(DAILY_KEY, JSON.stringify({ date: today(), used: dailyUsed() + 1 }));
}
