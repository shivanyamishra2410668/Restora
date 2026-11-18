const PREFIX = 'restora:page-cache:';

export function readPageCache(key, maxAgeMs = 30_000) {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.savedAt > maxAgeMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function writePageCache(key, value) {
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Cache is best effort; storage limits must never block restaurant workflows.
  }
}

export function invalidatePageCache() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Continue with the database result even when session storage is unavailable.
  }
}
