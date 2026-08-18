import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase owns `auth.users`. This is a reference declaration so our tables can
 * hold a foreign key to it — it is **not** ours to migrate.
 *
 * `drizzle.config.ts` sets `schemaFilter: ["public"]` so drizzle-kit never
 * emits DDL for this schema. If you ever see a generated migration touching
 * `auth.*`, the filter has been lost and the migration must not be applied.
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});
