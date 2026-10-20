// Pure network helpers (no React, no Supabase) so they can be unit-tested in Node.

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet_disconnected|err_network|err_connection|timed? ?out|aborted|offline|could not connect/i;

/** True when an error looks like a connectivity problem rather than a server/logic error. */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const message = typeof error === 'string' ? error : `${error.name || ''} ${error.message || ''}`;
  return NETWORK_ERROR_PATTERN.test(message);
}

/** Exponential backoff with jitter: attempt 0 -> ~base, 1 -> ~2x base, ... capped at maxMs. */
export function backoffDelay(attempt, { baseMs = 600, maxMs = 30000, jitter = 0.3, random = Math.random } = {}) {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const spread = exponential * jitter;
  return Math.round(Math.max(0, exponential - spread + random() * spread * 2));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries `task` on retryable errors with exponential backoff. Throws the last error. */
export async function retryWithBackoff(task, {
  retries = 3, baseMs = 600, maxMs = 8000, jitter = 0.3,
  shouldRetry = isNetworkError, random = Math.random, sleepFn = sleep, onRetry,
} = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      const delay = backoffDelay(attempt, { baseMs, maxMs, jitter, random });
      onRetry?.(error, attempt + 1, delay);
      await sleepFn(delay);
      attempt += 1;
    }
  }
}

/**
 * navigator.onLine only says "a network interface exists" — it is true on captive portals and
 * dead Wi-Fi. A real HEAD request to our own origin is the honest check.
 */
export async function probeConnectivity(url = '/manifest.webmanifest', {
  timeoutMs = 3500, fetchImpl = globalThis.fetch, navigatorImpl = globalThis.navigator,
} = {}) {
  if (navigatorImpl && navigatorImpl.onLine === false) return false;
  if (typeof fetchImpl !== 'function') return true;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const separator = url.includes('?') ? '&' : '?';
    await fetchImpl(`${url}${separator}_=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: controller?.signal });
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function formatAge(timestamp, now = Date.now()) {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
