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
let jwksCache: { keys: CachedJwk[]; fetchedAt: number } | null = null;

export async function getCachedJwks(): Promise<CachedJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return jwksCache?.keys ?? [];

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!response.ok) return jwksCache?.keys ?? [];
    const json = (await response.json()) as { keys?: CachedJwk[] };
    jwksCache = { keys: json.keys ?? [], fetchedAt: Date.now() };
    return jwksCache.keys;
  } catch {
    return jwksCache?.keys ?? [];
  }
}
