import { sql } from "drizzle-orm";

/**
 * Correlated subqueries over a query that selects from `groups`.
 *
 * ## Why these are written with literal identifiers
 *
 * Drizzle renders an interpolated column inside a `sql` template **unqualified**.
 * The natural-looking version,
 *
 * ```ts
 * sql`(select count(*)::int from ${subscriptions}
 *      where ${subscriptions.groupId} = ${groups.id})`
 * ```
 *
 * emits `where "group_id" = "id"` — and inside that subquery *both* names
 * resolve against `subscriptions`, because it has an `id` column too. The
 * condition therefore asks whether a subscription's group id equals its own
 * primary key, which is never true. It is valid SQL, it runs, it returns a
 * number, and the number is always zero.
 *
 * That failure has no symptom other than a wrong count, which is exactly the
 * kind of thing that ships. So the correlation is written out: an alias for the
 * inner table, and an explicit `"groups"."id"` for the outer one.
 *
 * `group-metrics.test.ts` asserts the emitted SQL keeps both.
 */

/** Requires `groups` in the outer query's FROM or JOIN. */
export function activeMemberCount() {
  return sql<number>`(
    select count(*)::int from "subscriptions" member_sub
    where member_sub."group_id" = "groups"."id"
      and member_sub."status" = 'ACTIVE'
  )`;
}

/** Requires `groups` in the outer query's FROM or JOIN. */
export function livePublishedCount() {
  return sql<number>`(
    select count(*)::int from "group_strategies" live_link
    where live_link."group_id" = "groups"."id"
      and live_link."removed_at" is null
  )`;
}

/** Whether one investor currently holds an active membership of the outer group. */
export function joinedByInvestor(investorId: string) {
  return sql<boolean>`exists (
    select 1 from "subscriptions" joined_sub
    where joined_sub."group_id" = "groups"."id"
      and joined_sub."investor_id" = ${investorId}
      and joined_sub."status" = 'ACTIVE'
  )`;
}
