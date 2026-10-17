// Owner "ad-free" mode. Set from the secret PIN in Settings, or by opening the magic link handled
// by the inline head script in public/index.html. Stored in localStorage + a 1-year cookie so it
// survives a localStorage clear and can be re-claimed on any device by opening the link once.
// Web-only in effect; on native the storage reads just return false (native has no ads anyway).
const OWNER_KEY = 'zd:owner';
const OWNER_COOKIE = 'zd_owner';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function hasOwnerCookie(): boolean {
  try {
    return new RegExp(`(?:^|;\\s*)${OWNER_COOKIE}=1(?:;|$)`).test(document.cookie);
  } catch {
    return false;
  }
}

export function isOwner(): boolean {
  try {
    if (localStorage.getItem(OWNER_KEY) === '1') return true;
  } catch {
    // Storage unavailable; fall through to the cookie.
  }
  return hasOwnerCookie();
}

export function setOwner(on: boolean): void {
  try {
    if (on) localStorage.setItem(OWNER_KEY, '1');
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Storage unavailable.
  }
  try {
    document.cookie = on
      ? `${OWNER_COOKIE}=1; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
      : `${OWNER_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
  } catch {
    // Cookies unavailable.
  }
}
