import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh.
 *
 * `middleware.ts` was renamed to `proxy.ts` in Next 16, and the Next team is
 * explicit that this file should be a last resort. So it does exactly one
 * thing: keep the Supabase auth cookie fresh, which has to happen before a
 * Server Component renders or every request sees a stale session.
 *
 * **Authorisation is not here.** The registration gate (`x-wealth-product.md`
 * §5.4) needs to read our `advisors` table, and a database round trip in a file
 * designed to run at a network boundary is the wrong shape. It lives instead in
 * `src/server/identity.ts` as a single guard every protected action calls —
 * which preserves the spec's actual intent, one chokepoint rather than scattered
 * per-endpoint checks. See `plan.md` W1-09.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what triggers the refresh. Do not remove it, and do
  // not add logic between creating the client and calling it — a stale token
  // here logs users out at random and it is miserable to debug.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets and image optimisation. Without this the
     * proxy runs on CSS, JS and images too, which is wasted work at best and a
     * broken page at worst.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
