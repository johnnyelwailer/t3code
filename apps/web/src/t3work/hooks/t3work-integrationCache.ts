export type IntegrationCacheRecord<T> = {
  readonly value: T;
  readonly updatedAt: number;
  readonly fingerprint?: string;
};

const STORAGE_PREFIX = "t3work.integration-cache.v1";
const memoryCache = new Map<string, IntegrationCacheRecord<unknown>>();

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}:${key}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParseRecord<T>(raw: string): IntegrationCacheRecord<T> | null {
  try {
    const parsed = JSON.parse(raw) as {
      value?: unknown;
      updatedAt?: unknown;
      fingerprint?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.updatedAt !== "number") return null;
    return {
      value: parsed.value as T,
      updatedAt: parsed.updatedAt,
      ...(typeof parsed.fingerprint === "string" ? { fingerprint: parsed.fingerprint } : {}),
    };
  } catch {
    return null;
  }
}

export function isIntegrationCacheFresh(
  updatedAt: number,
  maxAgeMs: number,
  nowMs = Date.now(),
): boolean {
  return nowMs - updatedAt <= maxAgeMs;
}

export function readIntegrationCache<T>(
  key: string,
  options?: {
    readonly maxAgeMs?: number;
    readonly nowMs?: number;
  },
): IntegrationCacheRecord<T> | null {
  const cached = memoryCache.get(key);
  if (cached) {
    if (
      options?.maxAgeMs !== undefined &&
      !isIntegrationCacheFresh(cached.updatedAt, options.maxAgeMs, options.nowMs)
    ) {
      return null;
    }
    return cached as IntegrationCacheRecord<T>;
  }

  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = safeParseRecord<T>(raw);
    if (!parsed) return null;
    if (
      options?.maxAgeMs !== undefined &&
      !isIntegrationCacheFresh(parsed.updatedAt, options.maxAgeMs, options.nowMs)
    ) {
      return null;
    }
    memoryCache.set(key, parsed as IntegrationCacheRecord<unknown>);
    return parsed;
  } catch {
    return null;
  }
}

export function writeIntegrationCache<T>(
  key: string,
  value: T,
  options?: {
    readonly updatedAt?: number;
    readonly fingerprint?: string;
  },
): void {
  const record: IntegrationCacheRecord<T> = {
    value,
    updatedAt: options?.updatedAt ?? Date.now(),
    ...(options?.fingerprint !== undefined ? { fingerprint: options.fingerprint } : {}),
  };

  memoryCache.set(key, record as IntegrationCacheRecord<unknown>);

  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(record));
  } catch {
    // Ignore storage write failures.
  }
}

export function normalizeCacheList(values: ReadonlyArray<string>): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .toSorted((a, b) => a.localeCompare(b))
    .join("|");
}
