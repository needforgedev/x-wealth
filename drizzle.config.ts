import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * `schemaFilter: ["public"]` is load-bearing: Supabase owns `auth`, `storage`
 * and `realtime`, and we reference `auth.users` by foreign key. Without the
 * filter, drizzle-kit would try to generate DDL for Supabase's own tables. If a
 * generated migration ever touches `auth.*`, do not apply it — the filter has
 * been lost.
 *
 * `generate` works entirely offline from the schema files. Only `migrate`,
 * `push` and `studio` need a live connection.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  casing: "snake_case",
  dbCredentials: {
    /**
     * DIRECT_URL, not DATABASE_URL. Migrations issue DDL — triggers, event
     * triggers, grants — and need a direct session connection (port 5432), not
     * the transaction pooler. Unused by `generate`, which runs offline.
     */
    url: process.env.DIRECT_URL ?? "",
  },
  verbose: true,
  strict: true,
});
