/**
 * Bộ khoá công khai (JWKS) của Supabase Auth, cache trong bộ nhớ tiến trình.
 * Dùng chung cho proxy và `getClaims` trên server để tránh fetch JWKS mỗi request.
 */

export interface CachedJwk {
  kty: string;
  key_ops: string[];
  kid?: string;
  [key: string]: unknown;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
interface JwksCacheState {
  cached: { keys: CachedJwk[]; fetchedAt: number } | null;
  request: Promise<CachedJwk[]> | null;
}

const globalCache = globalThis as typeof globalThis & {
  __supabaseJwksCacheState?: JwksCacheState;
};
const cacheState = (globalCache.__supabaseJwksCacheState ??= {
  cached: null,
  request: null,
});

export async function getCachedJwks(): Promise<CachedJwk[]> {
  if (cacheState.cached && Date.now() - cacheState.cached.fetchedAt < JWKS_TTL_MS) {
    return cacheState.cached.keys;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return cacheState.cached?.keys ?? [];
  if (cacheState.request) return cacheState.request;

  const staleKeys = cacheState.cached?.keys ?? [];
  const request = (async () => {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      if (!response.ok) return staleKeys;
      const json = (await response.json()) as { keys?: CachedJwk[] };
      const keys = json.keys ?? [];
      cacheState.cached = { keys, fetchedAt: Date.now() };
      return keys;
    } catch {
      return staleKeys;
    }
  })();
  cacheState.request = request;

  try {
    return await request;
  } finally {
    if (cacheState.request === request) cacheState.request = null;
  }
}
