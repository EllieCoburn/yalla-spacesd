/**
 * Finds the Postgres connection string. Accepts DATABASE_URL, or the names Vercel's Neon/Postgres
 * integrations create (POSTGRES_URL, or a custom prefix such as STORAGE_DATABASE_URL).
 */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = findUrl(env);
  return raw ? normalize(raw) : undefined;
}

/**
 * Removes libpq-only options the postgres.js driver would otherwise send to the server as
 * settings (Neon adds `channel_binding=require`, which the server rejects).
 */
export function normalize(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["channel_binding", "gssencmode", "target_session_attrs"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

function findUrl(env: Record<string, string | undefined>): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const key = Object.keys(env).find((k) => /(_DATABASE_URL|_POSTGRES_URL)$/.test(k) && !/UNPOOLED|NON_POOLING|TEST_/.test(k) && env[k]);
  if (key) return env[key];
  // Any other *_URL holding a pooled Postgres connection string (e.g. a STORAGE_URL prefix).
  const any = Object.keys(env).find((k) => k.endsWith("_URL") && !/UNPOOLED|NON_POOLING|TEST_/.test(k) && /^postgres(ql)?:\/\//.test(env[k] ?? ""));
  return any ? env[any] : undefined;
}
