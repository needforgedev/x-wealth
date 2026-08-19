import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export * as schema from "./schema";

/**
 * Database client.
 *
 * NOT WIRED YET — nothing in the app imports this. It is here so the schema has
 * a home to connect to the moment Supabase credentials exist. Adding the first
 * caller is W1-02.
 *
 * ## Two URLs, and why it matters
 *
 * Supabase exposes the same database on two ports and using the wrong one is a
 * classic and confusing failure:
 *
 * - **`DATABASE_URL`** — the transaction pooler (port 6543, pgbouncer). This is
 *   what serverless request handlers use. Prepared statements do not survive a
 *   transaction pooler, hence `prepare: false` below. Getting this wrong
 *   produces intermittent "prepared statement already exists" errors under
 *   load, not on the first request.
 * - **`DIRECT_URL`** — a direct session connection (port 5432). Migrations and
 *   anything issuing DDL must use this. The transaction pooler cannot run our
 *   trigger and event-trigger DDL reliably.
 *
 * `drizzle.config.ts` should point at `DIRECT_URL` once both exist.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the " +
        "Supabase connection strings. See src/db/README.md.",
    );
  }
  return url;
}

/**
 * The pool is cached on `globalThis`, not in module scope.
 *
 * Next's dev server re-evaluates modules on every hot reload. A module-scoped
 * singleton is therefore not a singleton: each reload builds a fresh pool and
 * abandons the previous one with its sockets still open. They accumulate
 * against the pooler's connection limit until every query sits waiting —
 * observed as 25–30 second page loads before this was fixed, which looks like a
 * hang rather than the resource leak it is.
 */
const globalForDb = globalThis as unknown as {
  __xwClient?: ReturnType<typeof postgres>;
  __xwDb?: ReturnType<typeof drizzle<typeof schema>>;
};

/**
 * Lazily-constructed singleton. Lazy so that importing the schema — which the
 * migration tooling and tests do — never requires a live database.
 */
export function db() {
  if (!globalForDb.__xwDb) {
    globalForDb.__xwClient ??= postgres(connectionString(), {
      // Required on the transaction pooler. See the note above.
      prepare: false,
      /**
       * A small pool, not one connection. `max: 1` serialises every query in
       * the process — a single page rendering three queries would run them
       * one after another, and any concurrent request waits behind all of them.
       * Supabase's transaction pooler multiplexes these onto far fewer server
       * connections, so a handful here is cheap.
       */
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalForDb.__xwDb = drizzle(globalForDb.__xwClient, { schema, casing: "snake_case" });
  }
  return globalForDb.__xwDb;
}

export type Database = ReturnType<typeof db>;
