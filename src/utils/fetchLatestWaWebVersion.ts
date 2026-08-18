import axios, { AxiosRequestConfig } from 'axios';
import type { WAVersion } from 'baileys';

export const WA_WEB_VERSION_FETCH_TIMEOUT_MS = 3000;
export const WA_WEB_VERSION_CACHE_KEY = 'whatsappWebVersion';
export const WA_WEB_VERSION_CACHE_TTL_SECONDS = 3600;

type WaWebVersionCacheEntry = {
  versionString: string;
};

export type WaWebVersionCache = {
  get(key: string): Promise<WaWebVersionCacheEntry | undefined>;
  set(key: string, value: WaWebVersionCacheEntry, ttl?: number): Promise<void> | void;
};

export type WaWebVersionResult = {
  version: WAVersion;
  isLatest: boolean;
  source: 'meta' | 'baileys' | 'static';
  externalCheckFailed?: boolean;
  error?: unknown;
};

export type FetchLatestWaWebVersionDeps = {
  axiosGet?: typeof axios.get;
  fetchBaileys?: () => Promise<{ version: WAVersion; isLatest: boolean }>;
  staticVersion?: WAVersion;
};

let staticWaWebVersion: WAVersion | undefined;

export const getStaticWaWebVersion = (): WAVersion => {
  if (staticWaWebVersion) {
    return staticWaWebVersion;
  }

  try {
    // Bundled default shipped with Baileys — safe when GitHub is down.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bundled = require('baileys/lib/Defaults/baileys-version.json') as { version: number[] };
    staticWaWebVersion = bundled.version as WAVersion;
  } catch {
    staticWaWebVersion = [2, 3000, 0] as WAVersion;
  }

  return staticWaWebVersion;
};

const resolveStaticVersion = (deps: FetchLatestWaWebVersionDeps): WAVersion =>
  deps.staticVersion ?? getStaticWaWebVersion();

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const defaultFetchBaileys = async () => {
  const { fetchLatestBaileysVersion } = await import('baileys');
  return fetchLatestBaileysVersion();
};

const fetchBaileysVersionSafe = async (
  deps: FetchLatestWaWebVersionDeps,
): Promise<{ version: WAVersion; source: 'baileys' | 'static' }> => {
  const fetchBaileys = deps.fetchBaileys ?? defaultFetchBaileys;

  try {
    const result = await withTimeout(
      fetchBaileys(),
      WA_WEB_VERSION_FETCH_TIMEOUT_MS,
      'fetchLatestBaileysVersion',
    );

    return { version: result.version as WAVersion, source: 'baileys' };
  } catch {
    return { version: resolveStaticVersion(deps), source: 'static' };
  }
};

export const fetchLatestWaWebVersion = async (
  options: AxiosRequestConfig = {},
  deps: FetchLatestWaWebVersionDeps = {},
): Promise<WaWebVersionResult> => {
  const axiosGet = deps.axiosGet ?? axios.get.bind(axios);

  const requestOptions: AxiosRequestConfig = {
    ...options,
    timeout: options.timeout ?? WA_WEB_VERSION_FETCH_TIMEOUT_MS,
  };

  try {
    const { data } = await withTimeout(
      axiosGet('https://web.whatsapp.com/sw.js', {
        ...requestOptions,
        responseType: 'json',
      }),
      requestOptions.timeout ?? WA_WEB_VERSION_FETCH_TIMEOUT_MS,
      'fetchLatestWaWebVersion',
    );

    const regex = /\\?"client_revision\\?":\s*(\d+)/;
    const match = String(data).match(regex);

    if (!match?.[1]) {
      const fallback = await fetchBaileysVersionSafe(deps);

      return {
        version: fallback.version,
        isLatest: false,
        source: fallback.source,
        externalCheckFailed: true,
        error: {
          message: 'Could not find client revision in the fetched content',
        },
      };
    }

    return {
      version: [2, 3000, +match[1]] as WAVersion,
      isLatest: true,
      source: 'meta',
    };
  } catch (error) {
    const fallback = await fetchBaileysVersionSafe(deps);

    return {
      version: fallback.version,
      isLatest: false,
      source: fallback.source,
      externalCheckFailed: true,
      error,
    };
  }
};

export const getWhatsAppWebVersionForRoot = async (
  cache?: WaWebVersionCache,
  deps: FetchLatestWaWebVersionDeps = {},
): Promise<{ versionString: string; externalCheckFailed: boolean }> => {
  if (cache) {
    const cached = await cache.get(WA_WEB_VERSION_CACHE_KEY);

    if (cached?.versionString) {
      return { versionString: cached.versionString, externalCheckFailed: false };
    }
  }

  const result = await fetchLatestWaWebVersion({}, deps);
  const versionString = result.version.join('.');

  if (cache) {
    await cache.set(
      WA_WEB_VERSION_CACHE_KEY,
      { versionString },
      WA_WEB_VERSION_CACHE_TTL_SECONDS,
    );
  }

  return {
    versionString,
    externalCheckFailed: !!result.externalCheckFailed,
  };
};
