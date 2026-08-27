# X-Wealth — Delivery Plan & Tracker

**Owner:** J · **Started:** 18 Aug 2026 · **Last updated:** 26 Aug 2026
**Direction:** v2 — single-persona AI strategy lab. See `CLAUDE.md`.

This is the working tracker. It turns `CLAUDE.md` into numbered, checkable work
and records what is actually done. Update it as work lands — it is the single
place that answers "where are we?"

> **26 Aug 2026 — this file was rewritten for the v2 direction.** The product is
> no longer a two-sided advisor/investor marketplace. It is a single-player
> strategy lab for retail traders. Roughly half the shipped code is now
> prohibited surface area rather than reusable groundwork. §1 and §10 say so
> plainly. Nothing has been deleted yet.

---

## How to use this file

Every item has a stable ID (`W1-03`, `AD-02`, `B-1`). IDs never get reused or
renumbered, so they can be referenced in commits and PRs.

| Mark | Meaning |
|---|---|
| `- [ ]` | Not started |
| `- [~]` | In progress |
| `- [x]` | Done and verified |
| `- [b]` | Blocked — the blocker ID must be named on the line |
| `- [-]` | Dropped — the reason must be on the line |

**Rules for keeping this honest:**

1. `- [x]` means verified, not written. For engine work that means a test
   asserts it; for UI it means it renders against real data, not fixtures.
2. When you block an item, name the blocker (`— blocked on B-1`). An item
   blocked on nothing is not blocked, it is not started.
3. Add new items at the end of a workstream with the next free number. Do not
   renumber.
4. Log every decision in §5 with the date it was decided. A decision without a
   date has not been made.
5. Append to the changelog at the bottom on each meaningful update.
6. **A v1 item that v2 kills is marked `- [-]` with the reason. It is not
   deleted.** The point of the ledger applies to our own work too.

### The documents and how they relate

| File | What it is | When to read it |
|---|---|---|
| `CLAUDE.md` | **The source of truth.** Product, legal architecture, invariants, data model, do-not-build | **Before writing any code** |
| `trading-domain-primer.md` | How markets and strategies actually work — intrabar, expectancy, costs, backtest failure modes | Before touching W5, W6, W18 |
| `plan.md` (this file) | Engineering delivery + live status | Daily |
| `AGENTS.md` | Next.js version note, machine-written by `next dev` | When Next behaves unexpectedly |
| `CLAUDE-v1-ARCHIVED-advisor-marketplace.md` | The abandoned v1 spec. Historical only | Never, for building |
| `x-wealth-product.md` | **Byte-identical duplicate of the archived v1.** Un-archived by name only | Never — see `W10-12` |
| `execution-plan.md` | v1 business plan: RA acquisition, revenue share, gates G1–G7 | **Stale.** Rewrite tracked at `W10-13` |
| `PRD X Wealth Agent for Digital Asset Markets.md` | Pre-v1 crypto-era PRD | Never. Crypto is out of scope (`CLAUDE.md` §10) |

> Code comments across `src/db/schema/*` cite `x-wealth-product.md §5.x`. Those
> section numbers no longer resolve to anything current. Re-point them at
> `CLAUDE.md` §8 as each file is touched — tracked at `W10-14`.

---

## 1. Where we are today

**Honest summary: the engine is further along than the last update recorded, and
the surface around it is now the wrong product.**

327 tests across 18 files, all green. Nine migrations applied to a live Supabase
project. A backtest engine and a forward-test engine that both run against real
Upstox bars. And a front end built almost entirely for a marketplace that v2
prohibits.

### Done and verified

- [x] **D-01** Next.js 16 / React 19 / Tailwind 4 scaffold, Turbopack, TS strict, eslint clean
- [x] **D-02** Design system: 19 UI primitives in `src/components/ui/`
- [x] **D-03** All 53 Figma artboards built (Investor 18, Advisor 26, Alpha 16)
- [x] **D-04** Figma `.fig` decoder (Kiwi schema parser)
- [x] **D-06** Supabase live (ap-south-1, PG 17.6): 9 migrations, append-only triggers, invariant verification in CI
- [x] **D-07** Auth end to end, both personas, server-guarded routes
- [x] **D-08** **Backtest engine** — `src/domain/{backtest,costs,indicators,session-step}.ts`, cost model with no gross path, reconciliation tests
- [x] **D-09** **Forward-test engine** — `src/domain/forward-test.ts` + `src/server/forward-test/{advance,replay}.ts`; DB-enforced parameter freeze proven by 14 raw-SQL attacks (`npm run verify-freeze`)
- [x] **D-10** **Market data layer** — `MarketDataSource` interface, EOD source, Upstox v3 adapter, conformance suite, universe + catalogue, `migration 0008`
- [x] **D-11** 7,514 lines of tested domain logic in `src/domain/`
- [x] **D-12** **Evening scheduler** — `.github/workflows/forward-tests.yml` (load → advance → health check, weekdays 16:45 IST) plus `npm run check-forward-tests`, which catches the case the jobs themselves cannot: succeeded, and nothing happened

### Not built

| Layer | State |
|---|---|
| **AI — any of it** | **Zero.** No provider dependency installed, no code. `ai_critiques` is an empty table |
| Hypothesis workbench | Not started. New in v2 |
| Adversarial backtest suite | Not started. No walk-forward, sensitivity, regime slice or Monte Carlo |
| Annotation layer | Not started. New in v2 |
| Event awareness | Not started. New in v2 |
| Portfolio risk + circuit breakers | Not started. New in v2 |
| Trigger proximity | Not started. New in v2 |
| Execution gap analysis | Not started. New in v2 — **the most differentiated module** |
| Review cadence / decay alerts | Not started. New in v2 |
| Iteration ledger | Partial — `/advisor/strategies/[id]` is a first form of it |
| Broker integration | Not started. Stage 2 |
| Single-user identity model | Not started. Schema and routes are still two-persona |
| Billing | None |

### The gap, stated plainly

Three things are true at once, and they pull in opposite directions.

**The engine survived the pivot intact.** Backtest, forward test, costs,
indicators, session arithmetic, money, symbols, market data — none of that cared
whether the author was a registered RA or a retail trader. It is the most
expensive work in the project and it transferred at full value.

**The distribution layer did not survive, and it is a large fraction of what
shipped.** Groups, signals, subscriptions, invitations, discovery, chat, the
investor persona, SEBI KYC. Under `CLAUDE.md` §2 and §8.5 these are not
deprioritised features — they are the prohibited surface. Cross-user visibility
of strategies or signals is the one constraint the whole compliance structure
rests on.

**The AI is now the headline and it is at zero.** In v1 the AI was one read-only
critique module, deferrable (`AD-16`). In v2 it is the front door — it compiles
the idea, sharpens the hypothesis, runs the adversarial attack, writes the
post-mortem, generates the digests. The product is called an *AI-powered
strategy lab* and there is not one line of it.

**So the honest read is:** the hard, irreducible part is largely done; the part
that must be removed is largely done too; and the part that defines the product
has not started.

---

## 2. Blockers board

`CLAUDE.md` §11 lists five open decisions. Mapped onto the existing IDs below,
with v1 blockers that v2 kills marked dropped.

| ID | Question | Gates | Owner | Status |
|---|---|---|---|---|
| **B-1** | **Restated for v2.** Pre-broker-partnership, what market data may we use for forward tests, and what may an equity curve display? The v1 framing (RA platform, 30-day educational lag) is moot — we serve retail traders using their own tooling. Upstox terms are in hand but redistribution terms are not | W3, W6 scope | Counsel | ☐ Open |
| **B-2** | **Restated for v2 — `CLAUDE.md` §11.1.** Does an AI-generated strategy count as "developed by the retail investor" under the retail algo framework? If a regulator reads it as *us* developing and distributing algos, we are an algo provider needing exchange empanelment, not a tool. **Working assumption: empanelment required. Do not build anything that depends on the opposite answer** | **Everything downstream of W23** | Counsel | ☐ Open |
| **B-3** | ~~Percentage of an RA's subscription income~~ | — | — | ✅ **Dropped 26 Aug 2026** — no RAs, no revenue share. We charge a subscription for the tool (`CLAUDE.md` §3, fact 1) |
| **B-4** | ~~What may we display without triggering PaRRVA verification~~ | — | — | ✅ **Dropped 26 Aug 2026** — we make no performance claims and publish nothing. §8.7 stands as an invariant, not a blocker |
| **B-5** | **Restated for v2.** Will retail traders pay for a tool that *refuses* to let them re-tune? The discipline layer is the entire differentiator and it is also the thing users will most want removed. 15 interviews — **with retail traders, not RAs** | **Everything** | J — non-delegable | ☐ Open |
| **B-6** | What data, at what latency, cost and redistribution terms? **Partly answered** — Upstox verified for OHLCV (adjusted, daily to 2000, 1-min since 2022); IndianAPI is close-only and secondary. Redistribution terms still open | W3, W5, W6 | Developer | ◐ Partial |
| **B-7** | Minimum forward-test window — statistical justification, not a guess. Placeholder 60 sessions (`CLAUDE.md` §11.3) | W6 | J + quant | ☐ Open |
| **B-8** | ~~PaRRVA export schema~~ | — | — | ✅ **Dropped 26 Aug 2026** — PaRRVA verifies claims by RAs, IAs and algo providers. We are none of those to our users |
| **B-9** | **New.** Free vs paid tier boundaries. `CLAUDE.md` §11.5: **cap compute, not features** — backtests are the real COGS. Where exactly? | W25 | J | ☐ Open |
| **B-10** | **New.** Broker partnership terms (`CLAUDE.md` §11.4). Determines COGS, the data path, and whether Stage 2 exists at all | W23, B-1 | J | ☐ Open |
| **B-11** | **New — surfaced 26 Aug 2026.** How is pre-lock iteration governed? Everything v2 clamps happens *after* the lock; before it, backtest iteration is unrestricted, which is exactly where p-hacking lives. §7.7 says the out-of-sample holdout is "used exactly once, never re-tuned against" but does not say how that is enforced. If the holdout figure is visible on every run it is contaminated by iteration three and nobody will notice | W5, W18, W6 | J + quant | ☐ Open |

> **B-2, B-5 and B-11 are the ones that matter.**
>
> B-2 is existential for Stage 2 but not for the first milestone — `CLAUDE.md`
> §14 ships with no broker integration at all.
>
> B-5 is existential for the whole thesis and has changed audience. Every v1
> interview finding about RAs is now irrelevant.
>
> **B-11 is new and it is a product-integrity blocker, not a legal one.** The
> parameter lock is the product. A lock that arrives after forty unmonitored
> backtest iterations is theatre, and we would be selling honesty we had not
> built. It needs an answer before W18 hardens.

### What is safe to build before the blockers close

Everything except W23 (broker), W25 (billing) and the holdout-enforcement half
of W18. B-1/B-6 constrain what data a *displayed* curve may use, not whether the
engine works. B-11 constrains how the holdout is exposed, not whether the
adversarial tests run.

**The teardown (W10) and the identity collapse (W24) are blocked on nothing and
should start first.** Every week they wait, more work lands on top of a schema
that has the wrong shape.

---

## 3. Module map — `CLAUDE.md` §7 against what exists

| §7 | Module | Phase | UI | Logic | Workstream |
|---|---|---|---|---|---|
| 7.1 | Auth & account | 0 | ✅ built (two-persona) | ✅ works, **wrong shape** | W1, W24 |
| 7.2 | Hypothesis workbench | 2 | ❌ | ❌ | **W15** |
| 7.3 | Strategy builder | 2 | ◐ `/advisor/strategies/*` | ◐ authoring + versioning done | W4 |
| 7.4 | Event awareness | 2 | ❌ | ❌ | **W16** |
| 7.5 | Annotation layer | 2 | ❌ | ❌ | **W17** |
| 7.6 | Backtest engine | 2 | ◐ `/advisor/backtests/[id]` | ✅ runs on real bars | W5 |
| 7.7 | Adversarial suite | 2 | ❌ | ❌ | **W18** |
| 7.8 | Forward test console | 3 | ◐ `/advisor/forward-tests/[id]` | ✅ runs, freeze proven | W6 |
| 7.9 | Portfolio risk | 3 | ❌ | ❌ | **W19** |
| 7.10 | Trigger proximity | 3 | ❌ | ❌ | **W20** |
| 7.11 | AI critique layer | 4 | ❌ | ❌ | W7 |
| 7.12 | Execution gap analysis | 4 | ❌ | ❌ | **W21** |
| 7.13 | Review cadence | 4 | ❌ | ❌ | **W22** |
| 7.14 | Iteration ledger | 5 | ◐ strategy detail page | ◐ versions accumulate | W8 |
| 7.15 | Broker integration | 6 | ❌ | ❌ | **W23** — blocked on B-2, B-10 |

**Read across that table:** five modules are partly built and nine have not
started. Of the nine, six are new in v2 and had no v1 equivalent to inherit
from.

### `CLAUDE.md` §7 has no Phase 1

The module table runs 0, 2, 3, 4, 5, 6. Phase 1 is unlabelled. Working
assumption is that Phase 1 is foundation + market data — W1 and W3, both largely
done. Recorded as `AD-17` rather than assumed silently.

---

## 4. Milestones

Reset against `CLAUDE.md` §14. The v1 milestones M0–M8 are dropped wholesale —
they were sequenced around advisor verification and investor distribution.

| # | Milestone | Contains | Exit condition |
|---|---|---|---|
| **N0** | Direction realigned | W10, W24 | Two-persona model gone from schema and routes; prohibited surface removed; app builds and tests stay green |
| **N1** | Idea → rule set | W4, W15 | A trader types an idea in plain English and gets a rule set with **all six mandatory components**. A strategy missing any one cannot be saved |
| **N2** | Honest backtest | W5, W16 | Backtest runs net of all Indian costs and reconciles to hand-calculation to the paisa. Intrabar resolved by 1-minute data or pessimistic by default |
| **N3** | The attack report | W18 | Walk-forward, sensitivity sweep, regime slice, Monte Carlo, cost sensitivity, holdout. Written report ranked by severity |
| **N4** | Locked forward test | W6, W17 | Hypothesis declared, parameters frozen at DB level, runs to completion on live data. Abandonment permanently recorded |
| **N5** | AI post-mortem | W7 | Structured findings, never verdicts. Provably cannot write back to a strategy definition |
| **N6** | **First milestone ships** | N1–N5 + W8 | `CLAUDE.md` §14's eight-point list passes end to end. **Sellable.** |
| **N7** | Live discipline | W19, W20, W21, W22 | Portfolio limits block; proximity is read-only and default OFF; execution gap attributes the difference; digests know how to say nothing |
| **N8** | Stage 2 | W23, W25 | Orders route to the user's own broker account. Blocked on B-2, B-10 |

> **N6 is the whole bet.** `CLAUDE.md` §14: *"If that works and traders pay for
> it, everything downstream is an execution problem. If they don't, nothing
> downstream matters."* No broker integration, no live money, no sharing.

### Timeline to N6

One developer, full time, with Claude Code. Excludes W0 (blockers) and
everything in N7/N8.

| Workstream | Remaining | Notes |
|---|---|---|
| W10 Teardown | 1.5 wk | Mechanical but wide — touches routes, schema and fixtures |
| W24 Identity collapse | 2 wk | Migration + auth + every server guard |
| W4 Strategy builder completion | 2 wk | Six mandatory components, sizing from the stop, universe filter |
| W15 Hypothesis workbench | 2 wk | First AI surface — includes provider setup, logging, `ai_interactions` |
| W16 Event awareness | 1.5 wk | Rule primitives + calendar sourcing. Can overlap |
| W5 Backtest completion | 3 wk | Intrabar via 1-min, survivorship universe, reconciliation suite |
| W18 Adversarial suite | 3.5 wk | ⚠️ Largest new build. Monte Carlo and walk-forward are not small |
| W17 Annotation layer | 1 wk | Cheap. **Ship early** — §7.5 says so and W21 depends on it |
| W6 Forward test completion | 2.5 wk | Fill realism, circuit limits, gap-through, min-window config |
| W7 AI critique + post-mortem | 3 wk | |
| W8 Iteration ledger | 1.5 wk | Private profile, not public. Can overlap W6 |
| **Code-complete** | **~23.5 wk** | |

**Add ~25% for the unknowns:** **~29 weeks**. Two developers takes it to roughly
20, and W18 is the one piece that genuinely parallelises.

#### Two things this estimate does not buy you

1. **The forward window is a calendar constraint, not an engineering one.** 60
   sessions (B-7) ≈ 12–14 calendar weeks after a test *starts*. **But the
   forward-test engine already works.** A real, locked test can start now,
   against real bars, while the rest is built — and that is the only way the
   calendar and the code finish together. Not starting one this month pushes N6
   out by a quarter for no engineering reason. Tracked at `W6-13`.
2. **The AI is no longer deferrable.** `AD-16` deferred W7 in v1 on the grounds
   that it was ~15% of the schedule and the most exposed to B-2. Under v2 the AI
   spans W15, W18, W7 and W22 — closer to 35% — and it is the product's stated
   identity. **`AD-16` is superseded; see `AD-21`.**

---

## 5. Architecture decisions

Each needs a date to count as decided. Recommendations are marked ⭐.

| ID | Decision | Options | Status |
|---|---|---|---|
| **AD-01** | Database | **Supabase (managed Postgres)** | ✅ **Decided 18 Aug 2026** |
| **AD-02** | Migrations / ORM | **Drizzle** — SQL-first, which is what raw triggers and grants need | ✅ **Decided 18 Aug 2026** |
| **AD-03** | Append-only enforcement | `BEFORE UPDATE/DELETE` triggers **+** revoked grants. **RLS alone is not enough** | ✅ **Decided 18 Aug 2026** |
| **AD-04** | Auth | **Supabase Auth**, phone OTP + an SMS provider (MSG91 for India) | ✅ **Decided 18 Aug 2026** |
| **AD-05** | Engine language | **TypeScript in-repo.** Settled in code: `src/domain/` is 7,514 lines of it | ✅ **Settled in code** |
| **AD-06** | Money & prices | **Money = integer paise, prices = fixed-precision, both branded.** `src/domain/money.ts`, 23 tests including the float traps | ✅ **Settled in code** |
| **AD-07** | Time | **UTC stored, IST displayed, 09:15–15:30, holiday-aware.** `src/domain/session.ts`, 25 tests | ✅ **Settled in code** |
| **AD-08** | Market data | **`MarketDataSource` interface + conformance suite.** EOD and Upstox implementations both pass it | ✅ **Settled in code** |
| **AD-09** | Scheduler | **GitHub Actions, `.github/workflows/forward-tests.yml`, weekdays 16:45 IST.** Chosen over a Vercel cron because both jobs are already `tsx` entry points that Actions runs unchanged — no API route duplicating a script — and because the loader makes six sequential vendor calls before it writes, which is the wrong shape for a serverless timeout | ✅ **Decided 26 Aug 2026** |
| **AD-10** | KYC document storage | Private bucket, signed URLs, access-logged | ➖ **Moot** — no KYC in v2 (W2 dropped). Retain the pattern for any future PII |
| **AD-11** | AI provider | ⭐ Claude, structured tool output (not prose), every call persisted. **No provider dependency is installed yet** | ☐ Open — **now on the critical path** |
| **AD-12** | Test stack | **Vitest** + Playwright ad hoc | ✅ **Decided 19 Aug 2026** |
| **AD-13** | Hosting | **Vercel + Supabase**; engine runner TBD with AD-09 | ✅ **Decided 18 Aug 2026** |
| **AD-14** | ~~Ship M6 standalone before M7?~~ | — | ➖ **Moot** — there is no M7. The tool *is* the product |
| **AD-15** | ~~Investor or Alpha onboarding canonical?~~ | — | ➖ **Superseded by AD-18** — both were built for personas that no longer exist |
| **AD-16** | ~~Defer AI critique?~~ | — | ➖ **Superseded by AD-21** |
| **AD-17** | **What is Phase 1?** `CLAUDE.md` §7 runs 0, 2, 3, 4, 5, 6. ⭐ Read it as foundation + market data (W1, W3) · or renumber the phases | ☐ Open |
| **AD-18** | **What happens to the v1 UI?** **Deleted on `v2-teardown`, tagged `v1-marketplace-final` first.** `/screens` went with it rather than being kept — roughly forty of its ~53 links pointed at removed routes, and a broken index is worse than none | ✅ **Decided 27 Aug 2026** |
| **AD-19** | **How is the pre-lock holdout protected?** ⭐ Holdout is sealed until the parameter lock and revealed exactly once, in the attack report · shown every run and merely labelled · per-strategy iteration budget. See **B-11** | ☐ Open |
| **AD-20** | **`ai_critiques` → `ai_interactions`.** v2 §9 widens it: `user_id`, `context_type`, applies to hypothesis / compile / critique / post-mortem / digest, not just forward tests. ⭐ New table + migrate the (currently empty) old one · widen in place | ☐ Open |
| **AD-21** | **AI sequencing.** The AI is now four modules, not one. ⭐ Build W15 first — it is the smallest surface, it forces the `ai_interactions` logging discipline early, and every later module reuses that plumbing · build W7 first · build them together | ☐ Open |
| **AD-22** | **Does `paper_trades` stay the forward-test ledger once `signal_events` and `execution_records` land?** v2 §9 has all three. Overlapping ledgers on append-only tables cannot be reconciled after the fact | ☐ Open |

### Supabase + Drizzle — things that will bite us

Unchanged by the pivot. All nine still apply.

1. **`service_role` bypasses RLS.** Invariants live in `BEFORE UPDATE/DELETE`
   triggers that `RAISE EXCEPTION` (triggers fire for every role) **plus**
   `REVOKE UPDATE, DELETE`. RLS is defence in depth, not the defence.
2. **Drizzle does not author triggers.** Every trigger, grant and check
   constraint is a hand-written SQL migration we own.
3. **Supabase Auth owns `auth.users`.** Our rows key off it by FK. Drizzle reads
   that table, never migrates it.
4. **Don't run the engine in Edge Functions.** Backtests and forward-test
   evaluation are long-running; Edge Functions are short-lived Deno. `pg_cron`
   can trigger a tick, but the engine needs a real Node worker (AD-09).
5. **PII needs `pgcrypto` or app-side encryption.** At-rest disk encryption is
   not the same as PAN being unreadable to anyone with DB access.
6. **Storage buckets default to awkward.** Private bucket, short-lived signed
   URLs, every read audited.
7. **Point-in-time recovery is a paid tier.** For a product whose pitch is an
   immutable record, backups are not optional.
8. **`CREATE EVENT TRIGGER` requires superuser, which Supabase does not grant.**
   The soft-delete guard is a callable assertion run by CI, not DDL that refuses
   the change outright. The column exists until CI catches it.
9. **`schemaFilter: ["public"]` does not stop the initial migration emitting
   `CREATE SCHEMA "auth"`.** Made idempotent by hand in `0000`.
10. **New — the teardown migration must drop triggers and restore grants in the
    same transaction as the tables.** `0001` revoked `UPDATE, DELETE` on the
    append-only tables from three roles and attached triggers to each. Dropping
    `signals` or `groups` without unwinding its trigger and grant leaves
    orphaned objects that `db:verify` will report forever. See `W10-06`.

---

## 6. Workstreams

### W0 — Close the blockers *(not engineering)*

- [-] **W0-01** ~~SEBI RA register, BSE RAASB cross-reference, 40-name list~~ — no advisors in v2
- [-] **W0-02** ~~15 RA interviews~~ — **superseded by W0-11.** Wrong audience entirely
- [-] **W0-03** ~~Synthesise RA findings~~ — superseded by W0-11
- [ ] **W0-04** Engage securities counsel with actual SEBI intermediary practice
- [ ] **W0-05** Get written answers to **B-1, B-2** (drop B-3, B-4 from the brief)
- [ ] **W0-06** Redistribution terms in writing from Upstox → closes the rest of **B-6**
- [-] **W0-07** ~~Advisor + investor agreements~~ — **superseded by W0-12.** One agreement now, not two
- [ ] **W0-08** Statistical justification for the minimum forward-test window → closes **B-7**
- [-] **W0-09** ~~Contact PaRRVA/CARE~~ — not applicable to a tool
- [ ] **W0-10** Book one week of a competent quant's time for W5 / W18 review — *still the cheapest insurance on this project, and W18 raises the stakes*
- [ ] **W0-11** **New.** 15 structured interviews with **retail traders** — existing broker account, ₹1L–₹50L, systematically inclined, cannot code. The question is not "would you use a strategy builder" (everyone says yes) but **"would you accept not being allowed to re-tune for 60 sessions"** → closes **B-5**
- [ ] **W0-12** **New.** Entity formation, ToS, single user agreement, DPDP privacy policy, and the disclosure language for a tool that is explicitly *not* advice
- [ ] **W0-13** **New.** Statistical position on holdout protection → informs **B-11** / `AD-19`

### W1 — Foundation

- [x] **W1-01** AD-01…AD-04, AD-10, AD-13 decided 18 Aug 2026
- [x] **W1-02** Supabase live (ap-south-1, PG 17.6); 9 migrations applied; `db:migrate` / `db:verify` / `db:inventory` wired
- [x] **W1-03** Schema across 9 Drizzle modules — **now the wrong shape, see W24**
- [x] **W1-04** Append-only constraints in `drizzle/0001`: triggers that `RAISE EXCEPTION`, the forward-test freeze, close-once paper trades, server-stamped `published_at`, 16 CHECKs, `REVOKE UPDATE, DELETE` from `anon` / `authenticated` / **`service_role`**
- [x] **W1-05** Verified green against the live database, 19 Aug 2026. 21 assertions, then a `SET LOCAL ROLE service_role` phase proving all 7 append-only mutations still rejected. Negative-controlled. Runs in CI
- [x] **W1-06** `assert_no_soft_delete_columns()` — passing, wired into CI. A callable assertion, not a DDL event trigger, because Supabase's `postgres` is not superuser
- [x] **W1-07** Supabase Auth end to end. Roles are rows, **not JWT claims**. ⚠️ `src/server/auth/dev-session.ts` still accepts fixed code `1111` — **delete it once SMS is configured** (`W1-23`)
- [x] **W1-08** Both onboarding paths wired and driven in a browser — **both now obsolete, see W24**
- [x] **W1-09** Registration gate as a single server-side chokepoint (`requirePublishingRights`), 8 tests. **v2 note:** there is nothing to gate any more — no publishing exists. Repurpose as the subscription-tier check or delete (`W24-06`)
- [ ] **W1-10** Audit logging: actor, action, entity, before/after, timestamp
- [ ] **W1-11** PII handling — phone, DOB encrypted at rest, access-logged, **never in logs, errors or analytics**. Scope shrinks with KYC gone; broker credentials in W23 bring it back harder
- [x] **W1-12** `src/domain/money.ts` — branded `Paise` / `PriceTicks`, decimal parsing that never constructs a float, 23 tests
- [~] **W1-13** `src/domain/session.ts` — IST sessions, 25 tests, timezone-independent. **Remaining:** the real NSE holiday list; still `PLACEHOLDER_CALENDAR_2026`
- [x] **W1-14** `src/domain/symbol.ts` — exchange-qualified, strict, 8 tests, one reading `drizzle/0001` so TS and SQL cannot drift
- [x] **W1-15** CI — typecheck, lint, test, build, plus a Postgres job running `verify_invariants.sql` twice, once as `service_role` with the grants deliberately restored
- [ ] **W1-16** Admin shell (role-gated, audit-logged) — partly satisfied by `/ops`
- [ ] **W1-17** RLS as defence in depth — **blocked on W1-21**
- [ ] **W1-18** `pgcrypto`; column-level encryption for PII
- [ ] **W1-19** Private Storage bucket — ➖ moot without KYC; revisit at W23
- [ ] **W1-20** Point-in-time recovery, and verify a restore actually works
- [ ] **W1-21** **Least-privilege `app_runtime` role.** We connect as `postgres`, which owns all 56 public objects and holds `rolbypassrls`. Blast radius, and **W1-17 is inert until this lands**
- [ ] **W1-22** Decide whether `SUPABASE_SECRET_KEY` is ever needed. Do not add it speculatively
- [ ] **W1-23** **New.** Delete `dev-session.ts` once a real SMS provider is configured. Three guards, one of which cannot hold in production

### W2 — Advisor onboarding + KYC

- [-] **W2-01…W2-09** **Dropped 26 Aug 2026.** There are no advisors. `CLAUDE.md` §2 abandons the RA direction outright, and with it SEBI registration capture, document review, the verification queue, expiry auto-suspend and the publishing gate. The `/ops` review queue and `platform_admins` may survive as generic admin tooling — decided at `W24-05`.

### W3 — Market data layer

- [x] **W3-01** `MarketDataSource` — OHLCV, LTP, session state, instrument metadata
- [x] **W3-02** `EndOfDaySource`
- [x] **W3-08** Conformance suite every implementation must pass, so the engine genuinely cannot tell them apart
- [x] **W3-10** **New — done.** Upstox v3 adapter (`src/server/market-data/upstox.ts`), catalogue, universe, `db-store`, migration `0008`
- [ ] **W3-03** `DelayedSource`
- [ ] **W3-04** `RealtimeSource` — **blocked on B-1, B-10**
- [~] **W3-05** Corporate actions. **Upstox returns an adjusted series** — verified across the RELIANCE 1:1 bonus (close ran 1327.85 → 1334.35, no ~50% phantom gap). That covers backtests. **Still needed:** an explicit event model for W16, since "skip entries near ex-dividend" is a rule primitive and an adjusted price series does not carry the dates
- [~] **W3-06** Historical load — daily verified back to 2000-01-03, 1-minute since Jan 2022 at exactly 375 bars/session. **Coverage across the full intended universe not yet confirmed**
- [ ] **W3-07** Lot sizes and circuit-limit data for fill realism. **Open: Upstox `tick_size` units** — reports 10.0 for RELIANCE, which is neither paise nor 1/10000 rupee. `universe.ts` deliberately ignores it and sets ₹0.01 from observed granularity. **Settle before W6-05 consumes it.** Note also that back-adjusted prices are not tick-aligned at all — the engine must never assume alignment
- [ ] **W3-09** Record the data answer in this file → closes **B-6**
- [x] **W3-11** **New — done 26 Aug 2026.** The Upstox analytics token **expires 2027-08-21** and the API does not report it, so the date is recorded by hand as `UPSTOX_TOKEN_EXPIRES_ON`. `check-forward-tests` warns at 60 days and **fails the job at 14** — a red run is what gets acted on. Both variables are now documented in `.env.example`, which had no market-data section at all

### W4 — Strategy Builder *(§7.3)*

- [x] **W4-01** Strategy definition JSON schema — structured data, not code
- [x] **W4-05** Append-only versioning with `parent_version_id` lineage — verified live: v1 → v2 with correct lineage, direct `UPDATE` rejected
- [x] **W4-07** Validation rejecting a strategy that cannot be evaluated
- [~] **W4-02** Indicator library — `src/domain/indicators.ts` with tests. Confirm ATR is present and hand-verified; §7.3 sizing and the primer both lean on it
- [~] **W4-03** Rule authoring: indicator + condition + action
- [~] **W4-06** Builder UI — exists at `/advisor/strategies/new`, needs re-homing in W24
- [ ] **W4-08** **New — the six mandatory components.** §7.3: universe *with liquidity filter*, entry, exit/target, stop-loss, position sizing, timeframe. **A strategy missing any one cannot be saved.** Enforce in the validator *and* as a CHECK, not in the form
- [ ] **W4-09** **New.** Position size derived from the stop: `size = (capital × risk%) ÷ (entry − stop)`. Not a free field
- [ ] **W4-10** **New.** Max concurrent positions, max exposure, gap / circuit / holiday handling, long/short — required alongside the six
- [ ] **W4-11** **New.** Universe liquidity filter that resolves to a tradeable set. **Read-only view of what it resolved; no hand-editing** (§10 — a curated watchlist is a discretionary override of the user's own rules)
- [ ] **W4-12** **New.** Natural language in, structured JSON out — the compile step. Depends on W15's AI plumbing

### W5 — Backtest Engine *(§7.6)* ⚠️ *highest technical risk*

- [x] **W5-01** Historical OHLCV execution simulator — `src/domain/backtest.ts` + `session-step.ts`
- [x] **W5-02** Cost model: brokerage, STT, stamp duty, exchange charges, SEBI turnover fee, GST, slippage — `src/domain/costs.ts`
- [x] **W5-03** **No `include_costs` flag; no code path yields a gross figure.** `cost_model` is `NOT NULL` on `backtest_runs`
- [x] **W5-10** Methodology disclosure — `src/domain/methodology.ts`, stored per run
- [x] **W5-12** **New — done.** One execution model, two callers. `advanceSession` is driven by both the backtest and the forward test, so the two cannot disagree about when a fill happens. The product's central claim is the comparison between them; a divergence would invalidate it silently
- [~] **W5-08** Reconciliation — `backtest-reconciliation.test.ts` exists. **Confirm it hand-calculates 20 trades to the paisa**, which is the actual bar
- [ ] **W5-04** **No-lookahead adversarial suite** — fixtures where any peek produces an impossible result, asserted to fail. *Intent is not sufficient*
- [ ] **W5-05** Corporate-action adjustment asserted per series — largely inherited from Upstox (W3-05), but assert it rather than trust it
- [ ] **W5-06** Survivorship-adjusted universe — **Upstox's instrument master drops delisted names**, so point-in-time constituents need a second source
- [~] **W5-07** Metrics. Present: return, drawdown, win/loss, trade count. **Missing per the primer Part 11 and §8.12: expectancy, R-multiple distribution, profit factor, Sortino, Calmar, longest losing streak, time in market, concentration.** §8.12: below ~100 trades, surface the inadequacy prominently
- [ ] **W5-09** External quant review (W0-10)
- [~] **W5-11** Results screen — `/advisor/backtests/[id]`, needs re-homing and the fuller metric set
- [ ] **W5-13** **New — the intrabar problem.** §7.6 calls it the biggest source of false results. Resolve using 1-minute data inside each bar. Where unavailable, **always assume the stop hit before the target**. Display which assumption was used per run — a user who does not know the fill model does not understand their own track record
- [ ] **W5-14** **New.** Gross and net displayed *together* (§8.3), so the drag is visible rather than merely accounted for

> *A subtly wrong backtest produces plausible numbers that are silently false,
> and everything downstream inherits the error.* W5-08 and W5-13 are where that
> risk lives.

### W6 — Forward Test Engine *(§7.8)*

- [x] **W6-01** Hypothesis declaration + parameter lock
- [x] **W6-02** DB-enforced freeze: `strategy_version_id` immutable once `RUNNING`
- [x] **W6-03** `npm run verify-freeze` — 14 raw-SQL attacks on the live database, all refused, inside a rolled-back transaction. *Gotcha recorded: `now()` is transaction-stable in Postgres, so `set started_at = now()` in the inserting transaction is a no-op and reads as a false hole in the freeze*
- [x] **W6-08** Abandonment flow — permanently recorded
- [x] **W6-09** Completion → immutable result record
- [x] **W6-13** **New — done.** Replay, never incremental state. `evaluateForwardTest` re-runs the whole window each evening and diffs against `paper_trades`. The append-only ledger stays the single source of truth, a missed evening self-heals, and running twice is a no-op — which is what makes retries safe against append-only tables
- [x] **W6-14** **New — done.** `progress.standing` vs `progress.metrics`: a *running* test has two net-return figures and **only `standing` may be displayed**, because the curve values open positions without paying their exit charges. Verified on a real 654-session window: −9.1709% against the curve's −9.1366%. W7 and W8 both read forward-test results and `metrics` is the field they will reach for first
- [x] **W6-04** **Scheduled evaluation — done 26 Aug 2026.** `.github/workflows/forward-tests.yml` runs load → advance → health check weekdays at 16:45 IST, serialised by a `concurrency` group so two runs can never write to append-only tables at once. Every step runs even when an earlier one fails, and the job fails at the end: on an unattended daily job, one run should report everything that is wrong rather than the first thing. **Gotcha recorded in the workflow header: GitHub disables scheduled workflows after 60 days without a commit** — a 60-session window and a quiet repository are exactly the combination that would stop the scheduler at the point the record matters most
- [x] **W6-16** **New — done. `npm run check-forward-tests`**, the alarm half. The two jobs already exit non-zero when they crash; this catches what neither can see — **everything succeeded and nothing happened**. Checks bar staleness per instrument, running tests overdue past `planned_end_at`, and vendor-token expiry. Verified in both directions on the live database: six stale series → 6 problems, exit 1; after a load → *pipeline healthy*, exit 0. **Warnings deliberately do not fail the run**, and zero trades on an evening is not a fault — §7.13's rule that an alarm which always finds something stops being read applies to our own infrastructure too
- [~] **W6-07** Live equity curve and running metrics — `npm run verify-standing` proves the figures against real bars
- [ ] **W6-05** Fill realism: slippage, liquidity caps, **circuit-limit handling, gap-through fills, no fills outside market hours, intraday square-off before close**. Depends on W3-07
- [~] **W6-06** Session + holiday awareness — real NSE calendar still outstanding (W1-13)
- [ ] **W6-10** Configurable minimum window (default from B-7)
- [~] **W6-11** Console UI — `/advisor/forward-tests/[id]`, needs re-homing
- [ ] **W6-12** Descope to EOD + positional if B-1 comes back negative — build against the interface either way
- [ ] **W6-15** **New, and urgent for the calendar.** Start one real, locked, 60-session forward test **now**, while the rest is built. The engine works. This is the single scheduling decision that determines whether N6 lands in ~7 months or ~10

### W7 — AI Critique Layer *(§7.11)*

- [ ] **W7-01** Read-only analysis service. **Never writes to a strategy definition** — a legal boundary, not a preference (§8.6)
- [ ] **W7-02** Structured findings, not verdicts. *"42 trades is below the threshold for statistical confidence at this win rate"* — **never** *"this strategy is weak"*
- [ ] **W7-03** Overfitting signals: parameter count vs trade count, sensitivity, oddly specific values
- [ ] **W7-04** Sample adequacy (§8.12)
- [ ] **W7-05** Regime dependence
- [ ] **W7-06** Liquidity feasibility at stated size
- [ ] **W7-07** Drawdown and tail-risk characterisation
- [-] **W7-08** ~~Plain-language explanation *for investors*~~ — no investors. **Replaced by W7-12**
- [ ] **W7-09** Full logging: input snapshot, output, timestamp, `user_acted`, `resulting_version_id` — *this log is the evidence the human authored the strategy* (§3 fact 2, Reg 16C)
- [ ] **W7-10** Test that no critique output path can reach a strategy write
- [ ] **W7-11** Critique view UI
- [ ] **W7-12** **New.** Plain-language explanation **for the author** — what their own rules actually do, which is a different job from explaining someone else's strategy to a stranger
- [ ] **W7-13** **New — the post-mortem.** §5 step 6: after a forward test completes, explain what happened and why, against the *declared hypothesis*. Without the hypothesis anchor (W15) the post-mortem is meaningless

### W8 — Iteration Ledger *(§7.14)*

- [~] **W8-01** **Private** profile with the complete test history. `/advisor/strategies/[id]` is a first form. **v2 change: it is visible to the user on their own profile, and to nobody else** (§8.5)
- [ ] **W8-02** Counts prominently displayed — *"12 forward tests run; 3 live, 9 abandoned"*
- [ ] **W8-03** Per strategy: every version, every test, every outcome
- [x] **W8-04** **No filtering, no hiding, no "featured" sort** — and no API parameter that could produce one. Held so far
- [ ] **W8-05** Test asserting an abandoned test is reachable from the profile
- [ ] **W8-06** Ledger UI
- [ ] **W8-07** **New.** Read `final_results` for completed tests and `standing` for running ones — never `metrics` (W6-14)

### W9 — PaRRVA readiness

- [-] **W9-01…W9-05** **Dropped 26 Aug 2026.** PaRRVA verifies past performance claims by RAs, IAs and algo providers. We publish nothing and make no claims (§8.7), so there is nothing to verify. Closes **B-8**.

### W10 — v1 teardown *(the app contains a product we may not ship)*

The v1 items here were about invariant violations. Most are now moot because the
component itself is going.

- [x] **W10-01** Removed with the group cards, 27 Aug 2026 (W10-15)
- [x] **W10-02** Done 27 Aug 2026 — `aum: "345%"`, `accuracy: "94%"`, `rating: 4.9` and `Revenue ₹230K` went with `lib/{groups,advisor,subscription}.ts`
- [x] **W10-03** Done 27 Aug 2026 — `INP000005847` went with `lib/subscription.ts`
- [-] **W10-04** ~~Cut free-form group chat~~ — goes with groups
- [-] **W10-05** ~~Fix the "Acuracy" typo~~ — moot
- [-] **W10-08** ~~Strategy discovery~~ — **prohibited.** Cross-user strategy visibility is §8.5
- [-] **W10-11** ~~Send Signal → Preview artboard~~ — signals are gone
- [x] **W10-06** **Done 27 Aug 2026.** Teardown migration `0009`. Drop the distribution schema — groups, `group_strategies`, `group_invitations`, subscriptions, pricing tiers, signals, `market_views` — **unwinding each table's append-only trigger and grant in the same transaction**, or `db:verify` reports orphans forever
- [ ] **W10-07** Resolve any remaining v1 doc contradictions — largely moot now that `CLAUDE.md` is the single source
- [ ] **W10-09** Ban list as a lint rule: no "verified", "top-rated", "high-performing", "best" copy anywhere (§8.7). **Still needed — this one survives the pivot intact**
- [-] **W10-10** ~~Replace the `/alpha` placeholder assets~~ — moot, `/alpha` is gone (AD-18)
- [ ] **W10-12** **New.** Delete or rename `x-wealth-product.md`. It is byte-identical to `CLAUDE-v1-ARCHIVED-advisor-marketplace.md` and its name reads as current
- [ ] **W10-13** **New.** Rewrite `execution-plan.md` for v2, or archive it. It plans RA acquisition, revenue share and gates G1–G7 against a business that no longer exists
- [ ] **W10-14** **New.** Re-point `x-wealth-product.md §5.x` citations across `src/db/schema/*` at `CLAUDE.md` §8. They currently resolve to a dead document
- [x] **W10-15** **Done 27 Aug 2026.** Removed the prohibited routes — `/groups/*`, `/group-invitations`, `/discover*`, `/chats`, `/signals`, `/investor/{discover,groups}`, `/advisor/{groups,create-group,signals,chats,pricing}`, `/portfolio/groups`, `/profile/favourites`, `/account/{choose,switch}`, and the `/alpha` tree per AD-18
- [x] **W10-16** **Done 27 Aug 2026.** Removed `src/components/{groups,chat}`, `src/server/actions/{group,invitation,signal}.ts`, and the group/signal query modules
- [x] **W10-17** **Done 27 Aug 2026.** Deleted `src/domain/signal.ts` and its 26 tests. A signal in v2 is `signal_events` — an internal record of what a strategy fired, never something delivered to another person
- [x] **W10-19** **New — done 27 Aug 2026.** Three repairs the removals forced, each a holding shape until W24: `BottomNav` pointed three of five tabs at deleted routes and is now two, centred rather than spread on five-item spacing; `/investor/home` was groups and invitations end to end and is now an honest stub, because `investor-onboarding.ts` still redirects there and it cannot vanish before the personas merge; `_shared.ts` re-exported `SignalTarget` from the deleted signal domain, so it is inlined and marked temporary — it goes with the `signals` table in W10-06
- [ ] **W10-20** **New.** `/investor/home` is a stub with nothing in it. It disappears at W24-07, when the trader's landing page becomes their strategy list. **Do not add content to it in the meantime** — a screen that fills its own empty space starts implying a capability that is not there
- [ ] **W10-18** **New.** Migrations `0006` and `0007` built the group slice. They stay in history (that is how migrations work); the teardown is a *new* forward migration, never an edit to a shipped one

### W11 — Investor side

- [-] **W11-01…W11-05** **Dropped 26 Aug 2026.** There is no investor persona. The risk-disclosure acknowledgement (W11-02) is the one piece worth keeping — `users.risk_ack_at` survives in the v2 data model. Carried to `W24-04`.

### W12 — Groups, signals & advisor dashboard

- [-] **W12-01…W12-07** **Dropped 26 Aug 2026. This is the prohibited surface.** §2: under SEBI's retail algo framework an algo developed by a retail investor may be used only by that investor and immediate family — not sold, rented, shared or distributed, for money or free. §8.5 makes it the single most load-bearing constraint in the product.

### W13 — Portfolio, attribution & payments

- [-] **W13-01…W13-04** ~~Manual portfolio + signal attribution~~ — **superseded by W19 and W21.** The *idea* survives and gets stronger: v1 measured whether an investor followed an advisor's signal; v2 measures whether a trader followed **their own strategy**, which is both more useful and legally uncomplicated
- [-] **W13-05…W13-07** ~~Revenue share, CeFCoM exposure~~ — dropped. **Superseded by W25**

### W14 — Beta & operations

- [ ] **W14-01** Closed beta — **retail traders, invite only.** Cohort size to follow B-5
- [ ] **W14-02** Instrument the guardrail metrics (§7 below)
- [ ] **W14-03** Complaint intake
- [ ] **W14-04** Quarterly legal review retainer — regulation changes mid-build
- [-] **W14-05** ~~Curate the early RA cohort~~ — no RAs
- [ ] **W14-06** Iterate on real usage before opening up

---

### W15 — Hypothesis Workbench *(§7.2 — new)*

- [ ] **W15-01** AI provider wired (AD-11), structured tool output, **not prose**
- [ ] **W15-02** `ai_interactions` table per AD-20 — `user_id`, `context_type`, `input_snapshot`, `output`, `user_acted`, `resulting_version_id`
- [ ] **W15-03** Every call logged before the response is shown. **Not after, not best-effort** — the log is the Reg 16C evidence, and a call that failed to log is a call that did not happen
- [ ] **W15-04** AI helps articulate a **falsifiable** hypothesis and challenges the premise
- [ ] **W15-05** Surfaces prior art
- [ ] **W15-06** **It must not generate ideas from price data.** Scanning data for patterns is p-hacking at the source (§7.2). This is a prompt constraint *and* a tool-access constraint — the workbench model gets no market-data tool
- [ ] **W15-07** Output: a written, timestamped hypothesis. **This is the anchor record — the post-mortem (W7-13) is meaningless without it**
- [ ] **W15-08** Workbench UI

### W16 — Event Awareness *(§7.4 — new)*

- [ ] **W16-01** `market_events` table: `event_type`, `symbol`, `event_date`, `source`, **`confirmed`**, `created_at`
- [ ] **W16-02** Rule primitives: `skip_entries_within(days, type)`, `flatten_positions_before(type)`, `no_new_positions_on(EXPIRY_DAY)`, `size_multiplier_during(window, multiplier)`
- [ ] **W16-03** Data: exchange holidays, F&O expiries, earnings, ex-dividend, splits, bonuses, RBI policy, Budget, CPI/IIP
- [ ] **W16-04** **Earnings dates get revised.** Treat unconfirmed dates as soft or backtests inherit a subtle lookahead error — the kind nobody notices because the numbers stay plausible
- [ ] **W16-05** **Not a news feed** (§10). Events are rule primitives; there is no content surface
- [ ] **W16-06** IndianAPI as the corporate-action source — it carries bonus/dividend with record and ex dates, which is the one thing it is good for

### W17 — Annotation Layer *(§7.5 — new, cheap, ship early)*

- [ ] **W17-01** `annotations` — append-only, `target_type` / `target_id`, `structured_reason`, `note_text`, `supersedes_id`
- [ ] **W17-02** Skip reasons: news event · didn't trust it · already exposed · insufficient capital · missed the window · other
- [ ] **W17-03** Override reasons: sizing up on conviction · sizing down on uncertainty · early exit on fear · early exit on other information · other
- [ ] **W17-04** Attachable to signals, trades, tests, versions
- [ ] **W17-05** **Annotations never alter facts** (§8.8). Editing appends with `supersedes_id`; nothing is overwritten
- [ ] **W17-06** Feeds W21 directly — **W21 cannot attribute a skip without a reason recorded at the time.** Retrospective reasons are reconstructions, and reconstructions are kind to the reconstructor

### W18 — Adversarial Backtest Suite *(§7.7 — new)* ⚠️ *largest new build*

- [ ] **W18-01** Walk-forward analysis
- [ ] **W18-02** Parameter sensitivity sweep — *collapse at RSI-13 vs RSI-15 ⇒ fitted to noise*
- [ ] **W18-03** Regime slicing: bull / bear / sideways / high-vol / low-vol
- [ ] **W18-04** Monte Carlo on trade order, 1,000+ shuffles
- [ ] **W18-05** Cost sensitivity — at what slippage does the edge vanish?
- [ ] **W18-06** Out-of-sample holdout — **used exactly once, never re-tuned against.** Enforcement is `AD-19` / **B-11**, and this line is the whole reason that blocker exists
- [ ] **W18-07** Output: a written attack report ranked by severity, persisted to `adversarial_reports`
- [ ] **W18-08** **The AI's job here is to break the strategy, not bless it.** A suite that mostly returns "looks fine" has been built wrong
- [ ] **W18-09** Attack report UI

### W19 — Portfolio Risk *(§7.9 — new)*

- [ ] **W19-01** `portfolio_snapshots`, `portfolio_limits`, `limit_breaches`
- [ ] **W19-02** Compute: total capital at risk (sum of open R), aggregate exposure %, sector and index concentration, correlation between held positions, overlapping symbols, margin headroom
- [ ] **W19-03** Circuit breakers, **all default ON**: exposure 60% · concurrent 10 · daily loss 3% · single symbol 15% · sector 30%
- [ ] **W19-04** **Breach → new entries rejected across all strategies.** Existing positions keep being managed by their own stops
- [ ] **W19-05** **Limits block, they do not warn** (§8.9). *A limit that only warns is not a limit*
- [ ] **W19-06** Log every rejection with its reason → `limit_breaches`
- [ ] **W19-07** **Per-strategy sizing does not protect against correlated positions.** Four strategies all long midcaps is one position, not four — this module exists because that is invisible from inside any single strategy

### W20 — Trigger Proximity *(§7.10 — new, read-only)*

- [ ] **W20-01** `Midcap Bounce · HDFCBANK · 3 of 5 conditions met · RSI 34.2 (needs < 30)`
- [ ] **W20-02** **No order button. No "enter now". No size adjust. No strategy edit.** (§8.10)
- [ ] **W20-03** **Default OFF.** §7.10 calls this the feature most likely to reintroduce discretionary trading — a user who watches proximity and acts early has abandoned their strategy while believing they are following it
- [ ] **W20-04** Test asserting no action control exists on the route, as a lint rule rather than a code review

### W21 — Execution Gap Analysis *(§7.12 — new)* ⭐ *most differentiated*

- [ ] **W21-01** `signal_events` — what the strategy said: symbol, side, `signalled_price`, `signalled_qty`, `signalled_at`, `computed_stop`, `computed_target`
- [ ] **W21-02** `execution_records` — what happened: `actual_price`, `actual_qty`, `executed_at`, `source` (`MANUAL` / `BROKER_API` / `NOT_TAKEN`), `broker_order_id`
- [ ] **W21-03** `execution_gaps` — derived, append-only, with the attribution payload
- [ ] **W21-04** Attribution by cause: slippage · timing delay · skipped signals · size deviation · early exit · late exit · manual override
- [ ] **W21-05** Stage 1 input: user marks taken/skipped, or imports a broker tradebook
- [ ] **W21-06** **Compare over the same period.** Theoretical vs actual across one window — *"the strategy signalled 19.4%; you got 11.2%; here is where the 8.2 went."* Comparing a live figure against an earlier paper figure conflates execution loss with regime change and produces a confident wrong answer
- [ ] **W21-07** **Value is highest at Stage 1 and shrinks under automation** (§7.12). The most compelling thing this product does is most compelling *before* broker integration — which is also the part that ships first. Design for that, do not treat it as a stopgap

### W22 — Review Cadence *(§7.13 — new)*

- [ ] **W22-01** `digests` — append-only, daily ~16:15 IST and weekly
- [ ] **W22-02** `decay_alerts` — `baseline_metric`, `current_metric`, `significance`, `ai_assessment`
- [ ] **W22-03** Distinguish **variance from breakage**, measured against the strategy's own recorded distribution: drawdown beyond forward-test max, win rate outside CI, average R degrading beyond expected variance, trade frequency materially changed
- [ ] **W22-04** **Silence must be a valid output** — *"this drawdown is within the expected range for your historical distribution. No change indicated."*
- [ ] **W22-05** **No alerts on ordinary losing periods** (§10). An alerting system that always finds something teaches users to overfit — it manufactures the exact behaviour the product exists to prevent
- [ ] **W22-06** Durable scheduler (AD-09), shared with W6-04

### W23 — Broker Integration *(§7.15 — Stage 2)* — blocked on B-2, B-10

- [b] **W23-01** OAuth only; open APIs disallowed — blocked on B-10
- [b] **W23-02** `broker_connections` with encrypted `credentials_ref` — blocked on B-10
- [b] **W23-03** **Morning arming ritual.** Sessions terminate daily; every user re-authenticates with 2FA each morning. 08:45 push, one-tap approval, explicit **"not armed today"** state so nobody assumes coverage they do not have. *True set-and-forget is impossible in India* — blocked on B-10
- [b] **W23-04** Static IP — brokers whitelist and reject mismatches; most Indian home connections are dynamic, so traffic routes through our whitelisted infrastructure — blocked on B-10
- [b] **W23-05** 10 OPS ceiling per client account — blocked on B-10
- [b] **W23-06** 5-year audit trail of all API activity — blocked on B-10
- [b] **W23-07** Orders route to the user's own account. **No custody, no discretion** (§8.11) — blocked on B-2

### W24 — Single-persona identity *(new — the pivot's structural work)*

- [x] **W24-01** **Done 27 Aug 2026.** `users` table per §9: `id`, `email`, `phone`, `created_at`, `plan_tier`, `risk_ack_at`. Replaces `advisors` and `investors`
- [x] **W24-02** **Done 27 Aug 2026.** `strategies.user_id` replaces `strategies.advisor_id`; same for every downstream FK
- [x] **W24-03** **Done 27 Aug 2026.** One flow: phone → profile → experience → risk → home. `/choose-interests` deleted with the `interests` column — it fed a discovery feed of other people's strategies. Resolves the dead `AD-15`
- [x] **W24-04** **Done 27 Aug 2026.** Risk acknowledgement carried across — three points acknowledged separately, not one blanket agreement (the one genuinely good piece of W11)
- [x] **W24-05** **Decided 27 Aug 2026.** `/ops` deleted — the KYC review queue had nothing left to review. `platform_admins` and `requireAdmin` kept: they cost nothing and W1-16 needs them when real admin tooling arrives. with no KYC queue to review
- [x] **W24-06** **Done 27 Aug 2026.** Deleted, not left permanently allowing — a gate that always opens reads like protection and is not. `requireUser` plus per-row ownership on `user_id` replaces it (W1-09) — nothing is published in v2
- [x] **W24-07** **Done 27 Aug 2026.** Re-homed the surviving routes: `/advisor/{home,strategies,backtests,forward-tests}` → top level
- [x] **W24-08** **Verified 27 Aug 2026.** Triggers and the parameter freeze both hold after the FK rewrite, including under `service_role`; `verify-forward-test` advanced a 120-session window, reconciled ledger against engine to four decimals (0.4231% both sides) and was refused when writing a result twice. **The migration was exactly the kind of change that quietly breaks the freeze, and it did not.** Re-run `verify_invariants.sql` and `verify-freeze` against the migrated schema. The freeze is the product; a migration is exactly the kind of change that quietly breaks it

### W25 — Subscription & billing *(new)* — blocked on B-9

- [b] **W25-01** Subscription for the **tooling**. §3 fact 1: *"₹X/month for unlimited backtests" is software; "₹X/month to see the top strategies" is publishing.* Same price, same UI, entirely different legal object — the copy is load-bearing — blocked on B-9
- [b] **W25-02** **Cap compute, not features** (§11.5). Backtests are the real COGS — blocked on B-9
- [b] **W25-03** Checkout, taxes, confirmation, management — blocked on B-9
- [ ] **W25-04** **No pricing tied to strategy access, output, or performance**, in any form, at any tier

---

## 7. Metrics to instrument

**Primary:** signups · strategies compiled · backtests run · forward tests
**completed** (not started) · paying subscribers · retention at 6 months

**Guardrail — these are the ones that matter:**

- [ ] **MET-01** **Completed-to-abandoned ratio.** *If it approaches 1:0, our standards are theatre.* Reframed from v1's published/abandoned — the numerator changes, the warning does not
- [ ] **MET-02** Median forward-test duration — *gaming shows up as short windows*
- [ ] **MET-03** **Pre-lock iteration count per strategy.** New, and the direct instrument for **B-11**. If the median trader runs 40 backtests before locking, the lock is protecting nothing
- [ ] **MET-04** Live vs paper delta per strategy (W21)
- [ ] **MET-05** ~~Complaint rate per advisor~~ → complaint rate overall
- [ ] **MET-06** **New.** Decay-alert silence rate. §7.13 requires silence to be a valid output; if it is never used, the alerting is manufacturing signal from noise
- [ ] **MET-07** **New.** Trigger-proximity opt-in rate. §7.10 defaults it OFF for a reason — a high opt-in rate is a leading indicator of users drifting back to discretionary trading

**Do not optimise for:** backtests run per user · strategies created · time in
app. *Every one of these goes up when discipline goes down.*

---

## 8. Do NOT build *(`CLAUDE.md` §10 — refuse these when they get suggested)*

**Legally prohibited or hazardous**

- Sharing, publishing, or any cross-user visibility of strategies or signals
- Copy-trading, leaderboards, strategy marketplace
- Fund custody, wallets, money movement
- Platform-generated strategy scores, ratings, or quality badges
- Ranking strategies by return
- Auto-applying AI suggestions to a strategy definition
- Hardcoded return figures anywhere, including seed data and demo content

**Architecturally corrosive**

- Chart drawing tools or visual level marking — *levels belong in rules, not the user's eye*
- Manual watchlist editor — the universe filter resolves the tradeable set. A read-only view of what it resolved is fine
- Any action control on the trigger-proximity screen
- Delete or hide functionality on any performance record
- Alerts that fire on ordinary losing periods
- News feed as content — events belong as rule primitives

**Out of scope**

- HFT or anything approaching 10 OPS
- Crypto
- Discretionary/manual order placement inside our UI
- Options strategies until the P&L model handles time decay properly

> **Note what changed from v1:** order execution moved from *prohibited* to
> *Stage 2 scope*, because orders now route to the user's own account under
> their own credentials rather than ours. Everything else on the v1 list either
> stayed or got stricter.

---

## 9. Standing risks

| Risk | Impact | Mitigation | Tracked by |
|---|---|---|---|
| Traders reject the discipline layer | **Fatal** | Test before building more. It is the differentiator *and* the friction | B-5, W0-11 |
| Classified as an algo provider needing empanelment | High | Assume it is required; it comes bundled with the broker partnership and is a far lower bar than RA registration | B-2 |
| **Pre-lock iteration makes the lock cosmetic** | **Fatal (product integrity)** | Seal the holdout; instrument iteration count | B-11, MET-03, AD-19 |
| Backtest engine subtly wrong | **Fatal (reputational)** | Hand-calculation reconciliation + external quant + intrabar honesty | W5-08, W5-13, W0-10 |
| Upstox token expires silently mid-forward-test | High | ✅ Mitigated — warn at 60 days, fail the job at 14 | W3-11 |
| No durable scheduler | High | ✅ Mitigated — evening workflow plus a health check that catches "succeeded and nothing happened" | AD-09, W6-04, W6-16 |
| GitHub disables the schedule after 60 days of repo inactivity | Medium | Documented in the workflow header. Bites only if the repo goes quiet *while* a window is running | W6-04 |
| Real-time data unavailable pre-partnership | Medium | Data abstraction layer; EOD fallback costs intraday, keeps positional | W3, B-1 |
| Zerodha ships this inside Kite | High | Streak already exists and has no AI. Speed is the only defence | — |
| Regulation changes mid-build | Medium | Quarterly legal review retainer | W14-04 |
| **We build features that weaken the discipline layer to improve conversion** | **Fatal** | §1: *every design decision that weakens it weakens the product.* Horizon's unlimited-retry model will look attractive every single quarter | §8, this table |

---

## 10. The honest read

The pivot is cheaper than it looks and more expensive than it sounds.

**Cheaper,** because the engine did not care who the author was. Backtest,
forward test, costs, indicators, sessions, money, symbols, market data — the
hardest and most expensive work in the project — transferred at full value.
Better than that, the parameter freeze is proven against the live database by
fourteen raw-SQL attacks, and the two engines share one execution model so they
cannot disagree about a fill. That is the discipline layer, already load-bearing.

**More expensive,** because the AI is at zero and it is now the front door.
Four modules, not one, and the first of them has to establish the logging
discipline that Reg 16C makes non-negotiable. There is not a provider dependency
installed.

**And there is a product-integrity hole that no amount of engineering closes.**
Everything v2 clamps happens after the lock. Before it, iteration is
unrestricted — which is exactly where p-hacking lives. We would be selling
honesty we had not finished building. **B-11 deserves an answer before W18
hardens, not after.**

Two things should happen before anything else, and neither is blocked:

1. **Start a real forward test this month.** The engine works, and as of 26 Aug
   the scheduler that keeps one honest works too — so this is now an afternoon
   of authoring, not an engineering task. Sixty sessions is twelve to fourteen
   calendar weeks that run in parallel with the build or serially after it, and
   that choice is worth a quarter. **This is the next thing that should happen**
   (W6-15).
2. **Fifteen conversations with retail traders**, asking the uncomfortable
   question rather than the flattering one. Not *"would you use an AI strategy
   builder"* — everyone says yes. **"Would you accept not being allowed to
   change anything for sixty sessions?"** If the answer is broadly no, that is
   worth knowing before ~29 weeks of engineering, not after.

**The UI isn't wasted, but roughly half of it now describes a product we may not
ship.** That is a clean, mechanical removal (W10, W24) and it should happen
before more work lands on a schema with the wrong shape.

---

## Changelog

| Date | Change |
|---|---|
| **27 Aug 2026** | **Identity collapsed (W24) and the distribution schema dropped (W10-06).** Migrations `0009` and `0010` applied to the live database: 22 tables → 12. `advisors` + `investors` → one `users` table, `strategies` and `portfolio_entries` repointed, KYC and PaRRVA fields gone, `interests` gone with the discovery feed it fed. `requirePublishingRights` deleted rather than left permanently allowing. Routes re-homed to top level; `/advisor/*`, `/investor`, `/ops`, `/choose-interests` removed. **W24-08 verified** — the freeze and the append-only triggers survived the FK rewrite, under `service_role`, and the engine still reconciles to four decimals. Data intact: 2 users, 4 strategies with owners, 5 versions, 5 backtest runs. Also fixed `db-migrate.mjs`, which reported "✓ migrations applied" having applied nothing because `migrate()` reads the journal rather than the folder — it now refuses to start when a numbered migration on disk has no journal entry. 276 tests green. |
| **27 Aug 2026** | **Distribution surface removed (W10-01, W10-02, W10-03, W10-15, W10-16, W10-17, W10-19; AD-18 closed).** 104 files, ~9,200 deletions on branch `v2-teardown`, tagged `v1-marketplace-final` first. Gone: groups, invitations, subscriptions and payments, signal composition and feeds, discovery, chat, the `/alpha` second pass, persona switching, the `/screens` Figma index, and the fixture modules carrying the hardcoded `aum`/`accuracy`/`rating` figures and the real-format SEBI number. Kept deliberately: `/portfolio` and `/profile` have no cross-user surface — superseding them is a W24/W19 scope question, not a legal one — and the onboarding flows are persona-specific rather than prohibited. **The schema is untouched on purpose**: dropping the distribution tables must unwind each one's append-only trigger and revoked grant in the same transaction (W10-06). 301 tests green, typecheck, lint and build clean. |
| **26 Aug 2026** | **Evening scheduler live (AD-09, W6-04, W6-16, W3-11).** `.github/workflows/forward-tests.yml` runs load → advance → health check on weekdays at 16:45 IST, serialised so two runs cannot write to append-only tables at once. New `scripts/check-forward-test-health.mts` is the alarm the other two jobs cannot raise: they exit non-zero when they crash, but a stale vendor feed makes a stalled test look exactly like a quiet market. It found real staleness on its first run — bars six days old — and went green after a load. **The 60-session clock can now start (W6-15).** |
| **26 Aug 2026** | **Rewritten for the v2 direction.** `CLAUDE.md` replaces `x-wealth-product.md` as the source of truth: single-persona AI strategy lab, no advisors, no investors, no distribution. **Dropped:** W2 (SEBI KYC), W9 (PaRRVA), W11 (investor), W12 (groups/signals), W13 (payments/attribution), blockers B-3/B-4/B-8, milestones M0–M8, decisions AD-14/15/16. **Added:** W15 hypothesis workbench, W16 event awareness, W17 annotations, W18 adversarial suite, W19 portfolio risk, W20 trigger proximity, W21 execution gap, W22 review cadence, W23 broker integration, W24 identity collapse, W25 billing; milestones N0–N8; blockers B-9/B-10/**B-11**; decisions AD-17…AD-22. **Restated:** B-1, B-2, B-5. Current state re-audited — 327 tests across 18 files, 9 migrations, backtest + forward-test engines live against real Upstox bars, AI at zero. |
| 24 Aug 2026 | **W6 forward-test engine live.** One execution model shared by both engines (`session-step.ts`), replay-not-cache each evening, `npm run verify-freeze` landing 14 raw-SQL attacks on the parameter freeze, and the `standing` vs `metrics` distinction — a running test has two net-return figures and only one has paid its exit charges. Verified on a real 654-session window. |
| 21 Aug 2026 | **Market data layer live.** Upstox chosen for OHLCV: adjusted series verified across the RELIANCE 1:1 bonus, daily back to 2000, 1-minute since 2022 at 375 bars/session. IndianAPI is close-only and demoted to corporate-action events. Open: `tick_size` units, redistribution terms, survivorship universe. |
| 20 Aug 2026 | Advisor groups + strategy sharing shipped (migrations `0006`, `0007`). **Superseded 26 Aug 2026 — this is the prohibited surface under v2 §8.5.** |
| 19 Aug 2026 | Investor flow wired; AD-15 resolved in favour of the Investor screens. **Both personas dropped 26 Aug 2026.** |
| 19 Aug 2026 | **W4 strategy authoring live.** Structured definition, validator rejecting unevaluatable strategies, `createStrategy` / `reviseStrategy` — a revision is a new row, never an update, confirmed against the live database with a direct `UPDATE` still refused by the trigger. Survives the pivot intact. |
| 19 Aug 2026 | **Fixed: database connection starvation.** `db()` cached a `max: 1` pool in module scope; Next's dev HMR leaked one per reload. Sign-in 25s → 0.31s. Would have bitten production too. |
| 19 Aug 2026 | **Fixed: a verified advisor was re-asked for every detail on sign-in.** Destination now computed from the record. Found while fixing it: two onboarding pages rendered for signed-out visitors. |
| 19 Aug 2026 | Advisor signup → verification working end to end on the live database. **Dropped 26 Aug 2026 with W2.** |
| 19 Aug 2026 | Migrations applied live and invariants verified on them (W1-02, W1-05, W1-06). Append-only proven to hold under `service_role`. Three defects found: `auth.users` DDL fails on Supabase permissions; `drizzle-kit migrate` exits 0 having done nothing when `pg` is missing; `DIRECT_URL` was on the transaction pooler. |
| 18 Aug 2026 | **Stack decided: Supabase + Drizzle on Vercel.** AD-01/02/03/04/10/13 closed. Supabase gotchas list added. |
| 18 Aug 2026 | Schema and invariant constraints written (W1-03, W1-04). 15 tables, 11 enums, 9 triggers, 16 CHECKs. `verify_invariants.sql` negative-controlled. Two gotchas recorded: event triggers need superuser; `schemaFilter` leaks `auth` on the first migration. |
| 18 Aug 2026 | File created. 53 screens built, zero backend. W0–W14, B-1…B-8, AD-01…AD-15 opened. |
