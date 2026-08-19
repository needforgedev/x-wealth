import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Used for **authentication only** — sign-in, sign-out, reading the session.
 * Application data never comes through here; it comes from Drizzle. Keeping
 * that line clean is what lets us run without a service key and without
 * depending on RLS for correctness.
 *
 * `cookies()` is async in Next 16, hence the await.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Harmless here: `proxy.ts`
          // refreshes the session on every request, so the write that matters
          // has already happened.
        }
      },
    },
  });
}
