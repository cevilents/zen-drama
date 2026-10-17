// Referral capture. Shared links carry ?utm_source=<channel> (or ?ref=). We remember the first
// source in this browser and beacon it to the Worker once per session, so the operator can see
// which channel/clip drives traffic without a third-party analytics account.
const REF_KEY = 'zd:ref';
const SENT_KEY = 'zd:ref:sent';

function urlSource(): string | null {
  try {
    const params = new URL(window.location.href).searchParams;
    return params.get('utm_source') || params.get('ref');
  } catch {
    return null;
  }
}

export function captureReferral(): void {
  if (typeof window === 'undefined') return;
  const source = urlSource();
  if (!source) return;
  try {
    if (!localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, source);
    if (sessionStorage.getItem(SENT_KEY)) return;
    sessionStorage.setItem(SENT_KEY, '1');
  } catch {
    // Storage unavailable; still send the beacon below.
  }
  void fetch('/t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ s: source }),
    keepalive: true,
  }).catch(() => {});
}
