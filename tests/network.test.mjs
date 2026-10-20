import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, formatAge, isNetworkError, probeConnectivity, retryWithBackoff } from '../src/lib/network.js';

test('isNetworkError recognises browser + supabase connectivity failures', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new Error('Could not save your personal music library: TypeError: Load failed')), true);
  assert.equal(isNetworkError(new Error('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isNetworkError(new Error('duplicate key value violates unique constraint')), false);
  assert.equal(isNetworkError(null), false);
});

test('backoffDelay grows exponentially, is capped, and jitter stays in range', () => {
  const noJitter = { baseMs: 500, maxMs: 4000, jitter: 0, random: () => 0.5 };
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((n) => backoffDelay(n, noJitter)), [500, 1000, 2000, 4000, 4000, 4000]);
  for (const r of [0, 0.5, 1]) {
    const d = backoffDelay(2, { baseMs: 1000, maxMs: 60000, jitter: 0.3, random: () => r });
    assert.ok(d >= 2800 && d <= 5200, `delay ${d} out of range`);
  }
});

test('retryWithBackoff retries network errors then succeeds', async () => {
  let calls = 0; const waits = [];
  const result = await retryWithBackoff(async () => { calls += 1; if (calls < 3) throw new TypeError('Failed to fetch'); return 'ok'; },
    { retries: 4, sleepFn: async (ms) => { waits.push(ms); }, random: () => 0.5 });
  assert.equal(result, 'ok'); assert.equal(calls, 3); assert.equal(waits.length, 2);
});

test('retryWithBackoff does not retry logic errors and gives up after N retries', async () => {
  let calls = 0;
  await assert.rejects(retryWithBackoff(async () => { calls += 1; throw new Error('permission denied'); }, { sleepFn: async () => {} }), /permission denied/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retryWithBackoff(async () => { calls += 1; throw new TypeError('Failed to fetch'); }, { retries: 2, sleepFn: async () => {} }), /Failed to fetch/);
  assert.equal(calls, 3);
});

test('probeConnectivity: true on any HTTP response, false on throw or navigator.onLine=false', async () => {
  const okFetch = async () => ({ status: 404 });
  assert.equal(await probeConnectivity('/x', { fetchImpl: okFetch, navigatorImpl: { onLine: true } }), true);
  assert.equal(await probeConnectivity('/x', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, navigatorImpl: { onLine: true } }), false);
  assert.equal(await probeConnectivity('/x', { fetchImpl: okFetch, navigatorImpl: { onLine: false } }), false);
});

test('probeConnectivity times out a hung request (captive portal / lie-fi)', async () => {
  const hung = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const started = Date.now();
  assert.equal(await probeConnectivity('/x', { fetchImpl: hung, navigatorImpl: { onLine: true }, timeoutMs: 40 }), false);
  assert.ok(Date.now() - started < 500);
});

test('formatAge', () => {
  const now = 1_000_000_000;
  assert.equal(formatAge(now - 10_000, now), 'just now');
  assert.equal(formatAge(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatAge(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(formatAge(now - 72 * 3600_000, now), '3 days ago');
  assert.equal(formatAge(0, now), '');
});
