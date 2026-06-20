const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getKey(ip, username) {
  return `${ip || 'unknown'}:${username || 'unknown'}`;
}

export function getLoginBlock(ip, username) {
  const key = getKey(ip, username);
  const record = attempts.get(key);
  if (!record) return null;
  if (record.blockedUntil && record.blockedUntil > Date.now()) {
    return { retryAfterSeconds: Math.ceil((record.blockedUntil - Date.now()) / 1000) };
  }
  if (record.firstAttemptAt + WINDOW_MS < Date.now()) attempts.delete(key);
  return null;
}

export function registerLoginFailure(ip, username) {
  const key = getKey(ip, username);
  const now = Date.now();
  const current = attempts.get(key);
  const record = !current || current.firstAttemptAt + WINDOW_MS < now
    ? { count: 0, firstAttemptAt: now, blockedUntil: null }
    : current;
  record.count += 1;
  let justBlocked = false;
  if (record.count >= MAX_ATTEMPTS) {
    justBlocked = !record.blockedUntil;
    record.blockedUntil = now + WINDOW_MS;
  }
  attempts.set(key, record);
  return { justBlocked, remainingAttempts: Math.max(MAX_ATTEMPTS - record.count, 0) };
}

export function clearLoginFailures(ip, username) {
  attempts.delete(getKey(ip, username));
}
