# Database

Supabase (Postgres) + Drizzle ORM. See `plan.md` §5 for the decision record and
`x-wealth-product.md` §5–§6 for the invariants this schema exists to enforce.

**Current state: schema and migrations are written, nothing is wired.** No app
code imports `src/db`, no migration has been run, and no credentials exist yet.

---

## Layout

```
drizzle.config.ts                       drizzle-kit config
drizzle/
  0000_initial_schema.sql               generated — tables, enums, indexes, FKs
  0001_invariant_constraints.sql        HAND-WRITTEN — triggers, CHECKs, grants
  meta/                                 drizzle snapshots; do not edit
src/db/
  index.ts                              client (lazy, unwired)
  schema/
    _shared.ts                          enums, column builders, JSONB types
    auth.ts                             reference to Supabase's auth.users
    advisors.ts   strategies.ts   testing.ts   critiques.ts
    investors.ts  distribution.ts  portfolio.ts  audit.ts
    index.ts                            barrel — what drizzle-kit reads
```

---

## When credentials arrive

```bash
cp .env.example .env.local     # fill in from the Supabase dashboard
npm run db:migrate             # applies 0000 then 0001, in order
```

Then verify the invariants actually hold — this is W1-05, and it is the whole
point of the setup:

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f drizzle/verify_invariants.sql
```

It asserts 21 behaviours — append-only rejection, the forward-test parameter
freeze, close-once paper trades, signal immutability and backdating, symbol
qualification, and the soft-delete guard — then rolls back, leaving nothing
behind. Any broken invariant aborts with `INVARIANT BROKEN: …`.

**Run it a second time connected as `service_role`.** That role bypasses RLS,
so if any of this were expressed as a policy it would sail straight through.
It is triggers precisely so that it does not — and this is how you confirm it
rather than assume it.

### Two traps this suite already fell into

**A row-level trigger does not fire on a statement that matches no rows.**
`update backtest_runs set …` against an empty table succeeds and proves
nothing. Every check inserts its own fixture first. If you add a check, add its
fixture.

**A guard suite that cannot fail is worthless.** This one was validated by
negative control — dropping each trigger in turn and confirming the suite
catches it. Do that again whenever you add a check.

---

## Rules

**Never `drizzle-kit push`.** It diffs the schema straight onto the database and
skips the migration files entirely — including `0001`, which is where every
invariant lives. A pushed database looks correct and enforces nothing. There is
deliberately no `db:push` script.

**Triggers and grants are hand-written.** drizzle-kit generates tables, columns,
indexes and foreign keys. Everything in `0001` it cannot see. Adding an
append-only table means adding its trigger there by hand, in the same commit.

**Supabase owns `auth`, `storage` and `realtime`.** `schemaFilter: ["public"]`
keeps drizzle-kit out of them. It does not stop the initial migration from
emitting `CREATE SCHEMA "auth"` — that was made idempotent by hand in `0000`.
If a future migration touches `auth.*`, do not apply it.

**Two connection strings.** `DIRECT_URL` (5432) for migrations and DDL,
`DATABASE_URL` (6543, transaction pooler, `prepare: false`) for runtime. Mixing
them up produces intermittent failures under load rather than an obvious error.

---

## Append-only tables

`strategy_versions` · `backtest_runs` · `forward_tests` · `paper_trades` ·
`ai_critiques` · `signals` · `audit_log`

Three of these permit one narrow, once-only transition, because they record
something that happens over time rather than in an instant:

| Table | Permitted | Everything else |
|---|---|---|
| `forward_tests` | status forward along legal edges; `ended_at` / `outcome` / `final_results` set once on leaving RUNNING | rejected — and all defining parameters freeze at RUNNING |
| `paper_trades` | the exit columns, `NULL → value`, once | rejected |
| `ai_critiques` | `advisor_acted` / `resulting_version_id`, once, by the advisor's action | rejected |

Everything else on those tables, and every UPDATE and DELETE on the other four,
raises an exception.

### Why this shape

`x-wealth-product.md` §5.1 says no UPDATE on any field that affects a recorded
result. A forward test and a paper trade are both records of something with a
duration — a trade opens now and closes later. Modelling that as a strictly
insert-only event log was the alternative; a single row with one permitted
write-once transition was chosen instead because it matches the data model in
spec §6 exactly and keeps the read path simple.

The invariant is preserved in the sense that matters: **a recorded result can
never be changed.** You may record the close of an open trade once. You may not
alter a close that already exists, revive a closed trade, or edit an entry.

If that reading is wrong, the fix is to split these into event tables — but it
should be a deliberate decision, not a drift.

---

## Things that must never enter this schema

Listed in `schema/index.ts` too, so the rule sits next to the code:

- `deleted_at`, `is_archived`, `visible` or any soft-delete flag on an
  append-only table. An event trigger in `0001` rejects these at DDL time.
- An `include_costs` flag, or any path that records a gross-return figure.
- A score, grade, rating or verdict column on a strategy or an advisor. The
  platform reports what happened; it never grades it.
- A messages table. Free-form group chat is cut for v1.
- A wallet, custodied-funds ledger, or broker order record.
