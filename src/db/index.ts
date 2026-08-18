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

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

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
 * Lazily-constructed singleton. Lazy so that importing the schema — which the
 * migration tooling and tests do — never requires a live database.
 */
export function db() {
  if (!database) {
    client = postgres(connectionString(), {
      // Required on the transaction pooler. See the note above.
      prepare: false,
      max: 1,
    });
    database = drizzle(client, { schema, casing: "snake_case" });
  }
  return database;
}

export type Database = ReturnType<typeof db>;
