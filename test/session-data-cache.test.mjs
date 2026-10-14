import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionDataCache } from '../src/lib/client-cache/session-data-cache.ts';

const ttl = { freshMs: 30_000, staleMs: 60_000 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const outcome of ['resolve', 'reject']) {
  test(`an old ${outcome} does not remove the replacement request`, async () => {
    const cache = new SessionDataCache();
    const old = Promise.withResolvers();
    const replacement = Promise.withResolvers();
    const first = cache.fetch('tasks', () => old.promise, ttl).catch(() => {});
    cache.invalidate('tasks');
    const current = cache.fetch('tasks', () => replacement.promise, ttl);
    if (outcome === 'resolve') old.resolve('old');
    else old.reject(new Error('aborted'));
    await first;
    assert.equal(cache.fetch('tasks', () => Promise.resolve('duplicate'), ttl), current);
    replacement.resolve('new');
    await current;
    assert.equal(cache.get('tasks').data, 'new');
  });
}

test('repeated hover does not fill the queue or refetch fresh data', async () => {
  const cache = new SessionDataCache();
  const blockers = Array.from({ length: 3 }, () => Promise.withResolvers());
  blockers.forEach((job, i) => cache.prefetch(`busy-${i}`, () => job.promise, ttl));
  let duplicateCalls = 0;
  let nextCalls = 0;
  for (let i = 0; i < 30; i++) {
    cache.prefetch('hovered', async () => { duplicateCalls++; return 'fetched'; }, ttl);
  }
  cache.prefetch('next', async () => { nextCalls++; return 'next'; }, ttl);
  cache.set('hovered', 'foreground result', ttl);
  blockers[0].resolve('done');
  await flush();
  assert.equal(duplicateCalls, 0);
  assert.equal(nextCalls, 1);
  assert.equal(cache.get('hovered').data, 'foreground result');
  blockers.slice(1).forEach((job) => job.resolve('done'));
  await flush();
});

test('clearing the session discards queued prefetches', async () => {
  const cache = new SessionDataCache();
  const blockers = Array.from({ length: 3 }, () => Promise.withResolvers());
  blockers.forEach((job, i) => cache.prefetch(`busy-${i}`, () => job.promise, ttl));
  let oldCalls = 0;
  let newCalls = 0;
  cache.prefetch('queued', async () => { oldCalls++; return 'old'; }, ttl);
  cache.clear();
  cache.prefetch('queued', async () => { newCalls++; return 'new'; }, ttl);
  blockers.forEach((job) => job.resolve('done'));
  await flush();
  assert.equal(oldCalls, 0);
  assert.equal(newCalls, 1);
  assert.equal(cache.get('queued').data, 'new');
});
