import type { HistoryEntry } from '@/store';

export interface HistorySection {
  key: 'today' | 'yesterday' | 'week' | 'older';
  title: string;
  data: HistoryEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight `daysAgo` days before today (DST-safe). */
function startOfDay(daysAgo: number): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo).getTime();
}

/**
 * Group entries (already sorted newest-first) by local calendar day:
 * Hari ini · Kemarin · Minggu ini (last 7 days) · Sebelumnya. Empty sections are dropped.
 */
export function groupHistory(entries: HistoryEntry[]): HistorySection[] {
  const today = startOfDay(0);
  const yesterday = startOfDay(1);
  const week = startOfDay(7);

  const buckets: HistorySection[] = [
    { key: 'today', title: 'Hari ini', data: [] },
    { key: 'yesterday', title: 'Kemarin', data: [] },
    { key: 'week', title: 'Minggu ini', data: [] },
    { key: 'older', title: 'Sebelumnya', data: [] },
  ];

  for (const e of entries) {
    const t = e.updatedAt;
    if (t >= today) buckets[0].data.push(e);
    else if (t >= yesterday) buckets[1].data.push(e);
    else if (t >= week) buckets[2].data.push(e);
    else buckets[3].data.push(e);
  }
  return buckets.filter((b) => b.data.length > 0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Short Indonesian relative time: "Baru saja", "5 mnt lalu", "2 jam lalu", "Kemarin 20.14", "3 hari lalu", "12 Mar". */
export function formatWatchedAt(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const d = new Date(ts);

  if (diff < 60 * 1000) return 'Baru saja';
  if (ts >= startOfDay(0)) {
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} mnt lalu`;
    return `${Math.floor(diff / 3600000)} jam lalu`;
  }
  if (ts >= startOfDay(1)) return `Kemarin ${clock(d)}`;
  if (ts >= startOfDay(7)) return `${Math.ceil((startOfDay(0) - ts) / DAY_MS)} hari lalu`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
