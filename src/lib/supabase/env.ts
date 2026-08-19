/**
 * Supabase connection details.
 *
 * Resolved lazily, on call, rather than at module load. Validating at import
 * time means anything that transitively imports this file — a unit test, a
 * build step, a script — dies on a missing variable it never needed. Fail where
 * the value is actually used.
 *
 * Only the publishable key appears here. There is deliberately no secret key in
 * this codebase — see `plan.md` W1-22. Data access goes through Drizzle over a
 * direct Postgres connection, roles live in our own tables, and authorisation
 * is decided server-side. Nothing needs a key that bypasses row-level security.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
