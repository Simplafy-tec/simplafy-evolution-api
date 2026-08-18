import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WA_WEB_VERSION_CACHE_KEY,
  WA_WEB_VERSION_CACHE_TTL_SECONDS,
  WA_WEB_VERSION_FETCH_TIMEOUT_MS,
  fetchLatestWaWebVersion,
  getWhatsAppWebVersionForRoot,
} from '../src/utils/fetchLatestWaWebVersion';

const STATIC_TEST_VERSION = [2, 3000, 42424242] as const;

const hang = (ms: number) =>
  new Promise<never>(() => {
    setTimeout(() => undefined, ms);
  });

describe('fetchLatestWaWebVersion — external deps down', () => {
  it('returns within timeout when Meta hangs and Baileys rejects (issue#2261)', async () => {
    const started = Date.now();

    const result = await fetchLatestWaWebVersion(
      {},
      {
        staticVersion: [...STATIC_TEST_VERSION],
        axiosGet: async () => hang(WA_WEB_VERSION_FETCH_TIMEOUT_MS + 5000),
        fetchBaileys: async () => {
          throw new Error('GitHub 503');
        },
      },
    );

    const elapsed = Date.now() - started;

    assert.ok(elapsed < WA_WEB_VERSION_FETCH_TIMEOUT_MS * 2 + 500, `took too long: ${elapsed}ms`);
    assert.equal(result.externalCheckFailed, true);
    assert.deepEqual(result.version, [...STATIC_TEST_VERSION]);
    assert.equal(result.source, 'static');
  });

  it('uses cache TTL (~1h) so repeated root lookups skip external calls', async () => {
    const calls: string[] = [];
    const cacheStore = new Map<string, { versionString: string }>();

    const cache = {
      async get(key: string) {
        calls.push(`get:${key}`);
        return cacheStore.get(key);
      },
      async set(key: string, value: { versionString: string }, ttl?: number) {
        calls.push(`set:${key}:${ttl}`);
        cacheStore.set(key, value);
      },
    };

    const deps = {
      staticVersion: [2, 3000, 1] as [number, number, number],
      axiosGet: async () => {
        calls.push('meta');
        return { data: '"client_revision": 42424242' };
      },
      fetchBaileys: async () => {
        calls.push('baileys');
        return { version: [2, 3000, 1] as [number, number, number], isLatest: true };
      },
    };

    const first = await getWhatsAppWebVersionForRoot(cache, deps);
    const second = await getWhatsAppWebVersionForRoot(cache, deps);

    assert.equal(first.versionString, '2.3000.42424242');
    assert.equal(first.externalCheckFailed, false);
    assert.equal(second.versionString, '2.3000.42424242');
    assert.equal(calls.filter((entry) => entry === 'meta').length, 1);
    assert.ok(calls.some((entry) => entry === `set:${WA_WEB_VERSION_CACHE_KEY}:${WA_WEB_VERSION_CACHE_TTL_SECONDS}`));
  });
});

describe('prova invertida — sem timeout o teste morre', () => {
  it('legacy fetch (sem timeout) não completa a tempo', async () => {
    const legacyFetch = async () => {
      await hang(60_000);
      return { version: [2, 3000, 1], isLatest: true, source: 'meta' as const };
    };

    await assert.rejects(
      async () => {
        await Promise.race([
          legacyFetch(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('legacy-hang-detected')), 200)),
        ]);
      },
      (error: Error) => error.message === 'legacy-hang-detected',
    );
  });
});
