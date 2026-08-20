import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { activeMemberCount, joinedByInvestor, livePublishedCount } from "./group-metrics";

const dialect = new PgDialect({ casing: "snake_case" });

function emitted<T>(fragment: SQL<T>): string {
  return dialect.sqlToQuery(fragment).sql;
}

/**
 * These assert on generated SQL rather than on results, because the bug they
 * guard against produces *valid* SQL with a wrong answer — a correlated
 * subquery that silently compares the inner table to itself and always counts
 * zero. Nothing throws, so only the text of the query gives it away.
 */
describe("correlated subqueries", () => {
  const cases = [
    ["activeMemberCount", emitted(activeMemberCount()), "member_sub"],
    ["livePublishedCount", emitted(livePublishedCount()), "live_link"],
    ["joinedByInvestor", emitted(joinedByInvestor("an-investor-id")), "joined_sub"],
  ] as const;

  for (const [name, sql, alias] of cases) {
    it(`${name} correlates on the outer groups row`, () => {
      expect(sql).toContain(`"groups"."id"`);
    });

    it(`${name} aliases the inner table so no name resolves twice`, () => {
      expect(sql).toContain(alias);
      // The bare, unqualified form is the failure mode: inside the subquery
      // `"id"` binds to the inner table, not to `groups`.
      expect(sql).not.toMatch(/=\s*"id"/);
    });
  }

  it("binds the investor id as a parameter rather than inlining it", () => {
    const query = dialect.sqlToQuery(joinedByInvestor("an-investor-id"));
    expect(query.sql).not.toContain("an-investor-id");
    expect(query.params).toContain("an-investor-id");
  });
});
