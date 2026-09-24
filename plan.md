# X-Wealth — Delivery Plan & Tracker

**Owner:** J · **Started:** 18 Aug 2026 · **Last updated:** 28 Aug 2026 (W5)
**Direction:** v2 — single-persona AI strategy lab. See `CLAUDE.md`.

This is the working tracker. It turns `CLAUDE.md` into numbered, checkable work
and records what is actually done. Update it as work lands — it is the single
place that answers "where are we?"

> **26 Aug 2026 — this file was rewritten for the v2 direction.** The product is
> no longer a two-sided advisor/investor marketplace. It is a single-player
> strategy lab for retail traders. Roughly half the shipped code is now
> prohibited surface area rather than reusable groundwork. §1 and §12 say so
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
4. Log every decision in §8 with the date it was decided. A decision without a
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
| `CLAUDE-v1-ARCHIVED-advisor-marketplace.md` | **The abandoned v1 spec**, and the only copy of it in the repo. Renamed 22 Sep 2026 (`W10-12`); its header now redirects each surviving §-citation to its v2 home | Never, for building |
| `execution-plan.md` | v1 business plan: RA acquisition, revenue share, gates G1–G7 | **Stale.** Rewrite tracked at `W10-13` |
| `PRD X Wealth Agent for Digital Asset Markets.md` | Pre-v1 crypto-era PRD | Never. Crypto is out of scope (`CLAUDE.md` §12) |

> **`CLAUDE.md` and `trading-domain-primer.md` were added to the repo on 28 Aug
> 2026.** They had lived on the author's Desktop since the pivot — unversioned,
> unbacked-up, and invisible to any tooling — while `plan.md` cited `CLAUDE.md`
> by section number roughly fifty times and called it the thing to read before
> writing any code. The only `CLAUDE.md` ever committed before this was a
> one-line stub, added in `54d3c4f` and deleted in `8e53443`.
>
> Two consequences worth knowing. A `CLAUDE.md` at the repo root is loaded
> automatically as project instructions by Claude Code, which is the intended
> effect and is now the case. And every §-citation in this file and in code
> comments can finally be checked by a reader who has only the repo.

> **Re-pointed 22 Sep 2026 (`W10-14`).** 63 named citations across 34 files, plus
> roughly sixty bare `§N` references in those same files that the original
> scoping missed — those carried v1 numbering too, so leaving them would have
> left each file citing two schemes at once.
>
> ⚠️ Three of those files are shipped migrations (`0001`, `0002`, `0006`) — the
> original scoping named only two and missed `0001`, which carries nine.
> `drizzle.__drizzle_migrations` stores a content hash per migration, so editing
> one — even a comment — makes the stored hash a lie. Exclude them from any
> mechanical pass; a citation inside a migration is dated by the migration.

---

## 1. Where we are today

**Honest summary: the engine is further along than the last update recorded, and
the surface around it is now the wrong product.**

367 tests across 20 files, all green. Fifteen migrations. A backtest engine, a
forward-test engine and an adversarial suite that all run against real Upstox
bars, and an iteration ledger over the top of them.

✅ **The hosted Supabase project resolves again** (24 Sep 2026). It was down for
a fortnight — `oejvxrrevfdotszvrqaz` returned NXDOMAIN and the pooler reported
the tenant as unknown — which stalled everything needing a database and failed
the evening scheduler every weekday. `check-forward-tests` now reports the
pipeline healthy: six instruments current, vendor token good for 331 days, zero
problems. `W1-20` stays open regardless — point-in-time recovery was never set
up, and that gap is what made a fortnight's outage a fortnight of held breath
rather than a restore.

### Done and verified

- [x] **D-01** Next.js 16 / React 19 / Tailwind 4 scaffold, Turbopack, TS strict, eslint clean
- [x] **D-02** Design system: 19 UI primitives in `src/components/ui/`
- [x] **D-03** All 53 Figma artboards built (Investor 18, Advisor 26, Alpha 16)
- [x] **D-04** Figma `.fig` decoder (Kiwi schema parser)
- [x] **D-06** Supabase live (ap-south-1, PG 17.6): 9 migrations, append-only triggers, invariant verification in CI
- [x] **D-07** Auth end to end, both personas, server-guarded routes
- [x] **D-08** **Backtest engine** — `src/domain/{backtest,costs,indicators,session-step}.ts`, cost model with no gross-only path, reconciliation to the paisa across 20 compounding trades. `backtest-2` adds take-profit targets, the pessimistic intrabar rule, the full W5-07 metric set and a property-based no-lookahead suite
- [x] **D-09** **Forward-test engine** — `src/domain/forward-test.ts` + `src/server/forward-test/{advance,replay}.ts`; DB-enforced parameter freeze proven by 14 raw-SQL attacks (`npm run verify-freeze`)
- [x] **D-10** **Market data layer** — `MarketDataSource` interface, EOD source, Upstox v3 adapter, conformance suite, universe + catalogue, `migration 0008`
- [x] **D-11** 7,514 lines of tested domain logic in `src/domain/`
- [x] **D-14** **Adversarial suite** — `src/domain/{adversarial,regime}.ts` + migration `0014`. Walk-forward, parameter sensitivity, regime slicing, trade-order Monte Carlo and cost sensitivity, ranked into an append-only report with no score anywhere. 32 tests, plus `npm run verify-adversarial` against live bars
- [x] **D-13** **AI interaction log** — `ai_interactions` (migration `0013`) plus `src/server/ai/`: the provider interface, a stub, and `runInteraction`, which does not return model output until the row is committed. 12 tests, invariants proven under `service_role`. **No provider is wired — see W15-01**
- [x] **D-15** **Iteration ledger** — `/ledger`, every window this account has started across every strategy, no filter and no parameter that could become one. `npm run verify-ledger`, 12 checks
- [x] **D-16** **Single-persona identity** — migrations `0009`/`0010`, 22 tables → 12, `advisors` + `investors` → one `users` table, routes re-homed to top level
- [x] **D-12** **Evening scheduler** — `.github/workflows/forward-tests.yml` (load → advance → health check, weekdays 16:45 IST) plus `npm run check-forward-tests`, which catches the case the jobs themselves cannot: succeeded, and nothing happened

### Not built

| Layer | State |
|---|---|
| **AI — the model half** | **Zero.** No provider dependency, no key, no billing (`AD-11`, W15-01). `resolveProvider()` returns a stub whose `metadata.live` is false |
| AI — the logging half | **Built and verified** (W15-02, W15-03). `ai_interactions` is live; `runInteraction` is the only route to a provider and records before it returns |
| Hypothesis workbench | Not started. New in v2 |
| Annotation layer | Not started. New in v2 |
| Event awareness | Not started. New in v2 |
| Portfolio risk + circuit breakers | Not started. New in v2 |
| Trigger proximity | Not started. New in v2 |
| Execution gap analysis | Not started. New in v2 — **the most differentiated module** |
| Review cadence / decay alerts | Not started. New in v2 |
| Broker integration | Not started. Stage 2 |
| Billing | None |

### The gap, stated plainly

Three things are true at once, and they pull in opposite directions.

**The engine survived the pivot intact.** Backtest, forward test, costs,
indicators, session arithmetic, money, symbols, market data — none of that cared
whether the author was a registered RA or a retail trader. It is the most
expensive work in the project and it transferred at full value.

**The distribution layer did not survive, and it is a large fraction of what
shipped.** Groups, signals, subscriptions, invitations, discovery, chat, the
investor persona, SEBI KYC. Under `CLAUDE.md` §2 and §10.5 these are not
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

`CLAUDE.md` §14 lists five open decisions. Mapped onto the existing IDs below,
with v1 blockers that v2 kills marked dropped.

| ID | Question | Gates | Owner | Status |
|---|---|---|---|---|
| **B-1** | **Restated for v2.** Pre-broker-partnership, what market data may we use for forward tests, and what may an equity curve display? The v1 framing (RA platform, 30-day educational lag) is moot — we serve retail traders using their own tooling. Upstox terms are in hand but redistribution terms are not | W3, W6 scope | Counsel | ☐ Open |
| **B-2** | **Restated for v2 — `CLAUDE.md` §14.1.** Does an AI-generated strategy count as "developed by the retail investor" under the retail algo framework? If a regulator reads it as *us* developing and distributing algos, we are an algo provider needing exchange empanelment, not a tool. **Working assumption: empanelment required. Do not build anything that depends on the opposite answer** | **Everything downstream of W23** | Counsel | ☐ Open |
| **B-3** | ~~Percentage of an RA's subscription income~~ | — | — | ✅ **Dropped 26 Aug 2026** — no RAs, no revenue share. We charge a subscription for the tool (`CLAUDE.md` §3, fact 1) |
| **B-4** | ~~What may we display without triggering PaRRVA verification~~ | — | — | ✅ **Dropped 26 Aug 2026** — we make no performance claims and publish nothing. §10.7 stands as an invariant, not a blocker |
| **B-5** | **Restated for v2.** Will retail traders pay for a tool that *refuses* to let them re-tune? The discipline layer is the entire differentiator and it is also the thing users will most want removed. 15 interviews — **with retail traders, not RAs** | **Everything** | J — non-delegable | ☐ Open |
| **B-6** | What data, at what latency, cost and redistribution terms? **Partly answered** — Upstox verified for OHLCV (adjusted, daily to 2000, 1-min since 2022); IndianAPI is close-only and secondary. Redistribution terms still open | W3, W5, W6 | Developer | ◐ Partial |
| **B-7** | Minimum forward-test window — statistical justification, not a guess. Placeholder 60 sessions (`CLAUDE.md` §14.3) | W6 | J + quant | ☐ Open |
| **B-8** | ~~PaRRVA export schema~~ | — | — | ✅ **Dropped 26 Aug 2026** — PaRRVA verifies claims by RAs, IAs and algo providers. We are none of those to our users |
| **B-9** | **New.** Free vs paid tier boundaries. `CLAUDE.md` §14.5: **cap compute, not features** — backtests are the real COGS. Where exactly? | W25 | J | ☐ Open |
| **B-10** | **New.** Broker partnership terms (`CLAUDE.md` §14.4). Determines COGS, the data path, and whether Stage 2 exists at all | W23, B-1 | J | ☐ Open |
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
| **N2** | Honest backtest | W5, W16 | ✅ **for W5 as of 28 Aug 2026** — net of all Indian costs, reconciled to the paisa across 20 compounding trades, intrabar pessimistic by default and disclosed per run. Outstanding: `W5-06` survivorship (needs a second data source), `W5-09` quant review (needs a quant), and W16 |
| **N3** | The attack report | W18 | ◐ **five of six attacks, persisted and on screen, 28 Aug 2026** — rendered end to end against a real recorded run. Outstanding: the holdout (`W18-06`, blocked on `AD-19` — a decision, not an implementation) and the AI's narrative framing (`W18-08`, blocked on `AD-11`) |
| **N4** | Locked forward test | W6, W17 | Hypothesis declared, parameters frozen at DB level, runs to completion on live data. Abandonment permanently recorded |
| **N5** | AI post-mortem | W7 | Structured findings, never verdicts. Provably cannot write back to a strategy definition |
| **N6** | **First milestone ships** | N1–N5 + ~~W8~~ ✅ | `CLAUDE.md` §14's eight-point list passes end to end. **Sellable.** |
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
| **AD-11** | AI provider | ⭐ Claude, structured tool output (not prose), every call persisted. **Still open, and the only part of W15 with an external dependency** — it needs an account, a key and billing. The seam is built and waiting: `resolveProvider()` in `src/server/ai/registry.ts` is the single function that changes | ☐ Open — **critical path, blocked on procurement not engineering** |
| **AD-12** | Test stack | **Vitest** + Playwright ad hoc | ✅ **Decided 19 Aug 2026** |
| **AD-13** | Hosting | **Vercel + Supabase**; engine runner TBD with AD-09 | ✅ **Decided 18 Aug 2026** |
| **AD-14** | ~~Ship M6 standalone before M7?~~ | — | ➖ **Moot** — there is no M7. The tool *is* the product |
| **AD-15** | ~~Investor or Alpha onboarding canonical?~~ | — | ➖ **Superseded by AD-18** — both were built for personas that no longer exist |
| **AD-16** | ~~Defer AI critique?~~ | — | ➖ **Superseded by AD-21** |
| **AD-17** | **What is Phase 1?** `CLAUDE.md` §7 runs 0, 2, 3, 4, 5, 6. ⭐ Read it as foundation + market data (W1, W3) · or renumber the phases | ☐ Open |
| **AD-18** | **What happens to the v1 UI?** **Deleted on `v2-teardown`, tagged `v1-marketplace-final` first.** `/screens` went with it rather than being kept — roughly forty of its ~53 links pointed at removed routes, and a broken index is worse than none | ✅ **Decided 27 Aug 2026** |
| **AD-19** | **How is the pre-lock holdout protected?** ⭐ Holdout is sealed until the parameter lock and revealed exactly once, in the attack report · shown every run and merely labelled · per-strategy iteration budget. See **B-11** | ☐ Open |
| **AD-20** | **`ai_critiques` → `ai_interactions`.** **New table; `ai_critiques` dropped in `0013`.** Widening in place would have meant making `forward_test_id` nullable — the only thing that column was for — while keeping `advisor_acted`, a persona deleted in `0010`, and the name `ai_critiques` on a table where four of five contexts are not critiques. The old table held **zero rows**, checked on the live database first, so nothing recorded was rewritten | ✅ **Decided 28 Aug 2026** |
| **AD-21** | **AI sequencing. W15 first**, and within it the logging spine before any model call. Reasoning held up in the build: `W15-02`/`W15-03` needed no provider, no key and no network, so the discipline every later module inherits is in place and tested while `AD-11` is still open. W4-12, W7, W18-08 and W22 all now hang off `runInteraction` rather than each inventing their own logging | ✅ **Decided 28 Aug 2026** |
| **AD-22** | **Does `paper_trades` stay the forward-test ledger once `signal_events` and `execution_records` land?** v2 §11 has all three. Overlapping ledgers on append-only tables cannot be reconciled after the fact | ☐ Open |

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
- [x] **W1-13** **Done 22 Sep 2026, corrected 23 Sep 2026 — and the correction is the point.** `PLACEHOLDER_CALENDAR_2026` carried three holidays for one year. Its replacement was transcribed from the exchange circular as republished by three calendar sites, and **it was wrong in eight places inside four years**. `NSE_CALENDAR` is now *derived from what NSE actually printed*: a weekday with no bar is a holiday, a weekday with a bar is not, no opinion involved — 92 holidays verified across 2020-01-01 → 2026-09-22, plus six forward-dated from the circular, plus eight observed weekend sessions. **Three dates were listed as closed on which the exchange traded** (2023-04-21, 2023-06-28, 2024-04-10, all Eid): the source marked them *Morning Off*, which is a commodity-segment half-day, and equity traded normally. That failure was loud — `assertValidSeries` refused the entire six-instrument backfill rather than degrading quietly, which is the guard doing exactly its job and the only reason it surfaced within a day. **Five were missing** (2023-06-29, 2024-01-22, 2024-04-11, 2024-05-20, 2024-11-20): both Eid dates off by one, plus the Ram Mandir consecration and two election closures that a generic calendar page does not carry. Those fail the other way — silently, because nothing rejects a *missing* holiday. **Diwali Laxmi Pujan stopped needing a special case**: deriving from bars means a date that traded is simply not a holiday, so the override the hand-built version required disappeared. `NSE_CALENDAR_COVERS` now distinguishes `verifiedTo` from `to`, because a date from a circular and a date from a printed bar are not the same kind of fact
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
- [x] **W4-08** **Done 27 Aug 2026.** The six mandatory components. §7.3: universe *with liquidity filter*, entry, exit/target, stop-loss, position sizing, timeframe. **A strategy missing any one cannot be saved.** Enforce in the validator *and* as a CHECK, not in the form
- [x] **W4-09** **Done 27 Aug 2026.** Position size derived from the stop: `size = (capital × risk%) ÷ (entry − stop)`. Not a free field
- [~] **W4-10** Max concurrent positions and max exposure are now fields on V2 and carried through `resolveDefinition`; **the engine does not yet enforce either** — that lands with W19, which is where portfolio-level limits belong. Gap/circuit/holiday handling still open, gap / circuit / holiday handling, long/short — required alongside the six
- [x] **W4-11** **Done 27 Aug 2026.** Universe liquidity filter that resolves to a tradeable set. **Read-only view of what it resolved; no hand-editing** (§12 — a curated watchlist is a discretionary override of the user's own rules)
- [x] **W4-12** **Done 23 Sep 2026.** `src/domain/compile.ts` + `src/server/actions/compile.ts`. **Data, never code** (§7.3): the comparable tools emit Pine Script or Python, and that one choice costs everything downstream — a script cannot be checked for the six components by a CHECK, cannot have its parameters perturbed by `W18-02` (which needs named fields, not source), and cannot be frozen, because the copy that runs is one the user pasted somewhere we cannot see. **The model's output is untrusted input**: the draft is deliberately a *different type* from `StrategyDefinitionV2`, and the only route between them re-runs `validateStrategyDefinition` with the same catalogue the authoring form uses — so the compiler is a route *to* the six mandatory components, never around them. Nine cases prove it cannot produce what the form would reject. **Operands are flattened** to one object with optional fields rather than a `oneOf` union, because a union is the commonest way structured output fails across models — and every combination the flattening makes sayable (`PRICE` with a period, `RSI` without one) is refused rather than repaired. **`NEEDS_INPUT` is a first-class answer**: a model that quietly invents a stop-loss produces a complete-looking strategy nobody authored, which is precisely what Reg 16C makes us answer for. **It proposes and stops** — saving goes through `createStrategy` as always, and `markCompileActed` links the version back to the interaction, which is the evidence the human authored it (§8.6). 22 tests, plus `npm run verify-compile`. **UI at `/strategies/new/chat`** — idea → questions → review → hypothesis, four steps where the third is load-bearing: §8.6 makes the output advisory, so every compiled rule is shown in plain language and the user presses save themselves. Assumptions the compiler settled without asking are listed *above* the rules in its own words, because the quiet failure is a strategy that looks fully authored when the parts nobody chose are indistinguishable from the parts they did. The form survives beside it at `/strategies/new`; the compiler is an entry point to the same six components, not a replacement for them

### W5 — Backtest Engine *(§7.6)* ⚠️ *highest technical risk*

- [x] **W5-01** Historical OHLCV execution simulator — `src/domain/backtest.ts` + `session-step.ts`
- [x] **W5-02** Cost model: brokerage, STT, stamp duty, exchange charges, SEBI turnover fee, GST, slippage — `src/domain/costs.ts`
- [x] **W5-03** **No `include_costs` flag; no code path yields a gross figure.** `cost_model` is `NOT NULL` on `backtest_runs`
- [x] **W5-10** Methodology disclosure — `src/domain/methodology.ts`, stored per run
- [x] **W5-12** **New — done.** One execution model, two callers. `advanceSession` is driven by both the backtest and the forward test, so the two cannot disagree about when a fill happens. The product's central claim is the comparison between them; a divergence would invalidate it silently
- [x] **W5-08** **Confirmed and extended 28 Aug 2026.** It does hand-calculate twenty trades to the paisa, and better than the bar asked: one trade written out as literals, then all twenty replayed by a second deliberately naive simulator sharing no code with the engine loop, agreeing on quantity, gross and net for every compounding cycle. **Extended to the take-profit path**, which had no coverage at all — that gap is precisely why `targetPercent` went unimplemented while the validator, the type and the CHECK all insisted it existed. The gate cannot see a code path nothing exercises
- [x] **W5-04** **Done 28 Aug 2026.** `backtest-lookahead.test.ts`, 11 tests. Written as **property tests, not fixtures**: a fixture catches the leak you thought of, and lookahead is dangerous precisely because it is the one nobody thought of. The general shape is prefix invariance — compute on the first *k* bars, compute on all of them, require the first *k* to be identical — applied at every prefix length to every indicator, to the signal series, to the liquidity mask, and to the engine's own closed trades. Anything reading forward breaks it, **including code added years from now by someone who never read the file**, which is the only kind of test that outlives the intent it was written with. Includes a negative control that deliberately peeks one bar ahead and must be rejected, because a property test that cannot fail proves nothing
- [x] **W5-05** **Done 28 Aug 2026.** `assertAdjustmentHolds` refuses a series declared `ADJUSTED` that contains a session moving more than 30% close-to-close. The threshold is grounded in market structure rather than guessed: NSE price bands are 2/5/10/20% and F&O names sit under a 10% dynamic band, so a move that size is not something the exchange permits the *price* to do — it is a split or bonus showing through. Wired into ingestion (`load-market-data`), so bad bars never land. An `UNADJUSTED` series passes untouched, because using raw data is permitted provided the run discloses it, and `methodology.data.adjustment` does
- [ ] **W5-06** Survivorship-adjusted universe — **Upstox's instrument master drops delisted names**, so point-in-time constituents need a second source
- [x] **W5-07** **Done 28 Aug 2026.** All of it: expectancy in paise and in R, the full R-multiple distribution, profit factor, Sortino, Calmar, longest losing streak, time in market, and concentration as the best trade's share of total profit. `ExecutedTrade` now carries `riskPaise` — recorded per trade rather than derived later, or a strategy whose stop percentage changed between versions would have its old trades re-expressed in units of a risk they never took. **Every one returns `null` rather than `0` when there is nothing to measure**, and the screen renders that as "Not measurable": a strategy with no losing session has an unmeasured Sortino, not a perfect one, and `0` reads as *measured, and it was poor*. `sampleAdequate` is part of the metrics rather than a rendering concern, so the screen, the attack report and the critique cannot each decide where §10.12's line sits
- [ ] **W5-09** External quant review (W0-10)
- [x] **W5-11** **Done 28 Aug 2026.** Re-homed at `/backtests/[id]` in W24 and now carrying the full metric set, the fill model in force, the target the run tested, and the §10.12 sample warning above the fold rather than in a footnote. Older runs render missing metrics as "Not recorded" — `backtest_runs` is append-only, rows written by `backtest-1` genuinely have none, and defaulting them to zero would be a claim about a measurement nobody made
- [x] **W5-13** **Done 28 Aug 2026, at the fallback.** A session reaching both the stop and the target is resolved as a **stop-out, always** — not sampled, not split, never in the strategy's favour. §7.6 permits resolving the true order with 1-minute data; `MarketDataSource` exposes `dailyBars` and `latestBar` only, so that option does not exist and the pessimistic rule is the whole policy rather than a fallback. Recorded per run as `methodology.execution.fillModel` and displayed, because a user who does not know the fill model does not understand their own track record. `FillModel` has a second value reserved so a run produced before 1-minute resolution can still say what it did instead of being reinterpreted under a policy it never ran under. **Extending the data layer to 1-minute bars is `W5-17`** — a new table, a loader and an interface method, not an edit here
- [x] **W5-14** **Done 28 Aug 2026.** Gross sits directly under net on the results screen, never behind a toggle, with the rupee total the charges took across the run. The gross figure is this run's own trades with their charges added back, **not a separate cost-free simulation** — a costless run would have funded different quantities (`affordableQty` pays charges out of cash) and the two would not be comparable. §10.3 is satisfied by the pair; neither number alone satisfies it, and there is still no code path that yields gross on its own

- [x] **W5-15** **New — done 28 Aug 2026. The engine did not read `targetPercent`.** It was validated with bounds, carried through `resolveDefinition`, required as a key by the `0012` CHECK, and named by §7.3 as half of the third mandatory component — and no line of `backtest.ts`, `session-step.ts` or `backtest-signals.ts` ever looked at it. The only exits the engine could produce were `SIGNAL`, `STOP_LOSS` and `END_OF_PERIOD`. **Latent, not live**: no form exposed the field and 0 of 6 stored versions set one, so no wrong number was ever produced. What made it urgent is what would have pulled the trigger — `W4-12` compiles plain English, and *"take profit at 20%"* is about the most natural sentence a trader says. Targets now fill as resting orders, round **up** so the rounding costs the strategy rather than favours it, and fill at the open on a favourable gap — modelling the gap down through a stop but not the gap up through a target is a thumb on the scale, not conservatism
- [~] **W5-16** **Two of the four wired, 22 Sep 2026.** `verify-freeze` and `verify-ledger` now run in CI's `invariants` job against its Postgres container, on every push. Two things were keeping them out, and neither was the fixtures problem this item assumed. **`verify-freeze` hardcoded `ssl: "require"`**, which a container does not speak — it died with `ECONNRESET` before landing a single attack; TLS is now decided from the host, so there is no flag anyone can set or forget to unset that would drop it on the way to the real database. **Both required a pre-existing user row and exited 1 without one**, which is precisely what confined them to a populated database and therefore to being run by hand. Each now seeds a fixture account *inside the transaction it already rolled back*, so a live database is still never written to, and an existing account is still preferred where there is one. **`verify-standing` and `verify-adversarial` remain manual** — they need loaded bars and a live vendor token, which is a genuine fixtures problem and stays open under this ID. Proven by reproducing the whole CI job against a throwaway Postgres 17 cluster: migrations, invariants, invariants under `service_role`, soft-delete guard, then both scripts — 14 of 14 attacks refused and 12 of 12 ledger checks passed on a database that started empty, and again on one that did not
- [ ] **W5-17** **New.** 1-minute bars in the data layer, so `W5-13` can resolve an ambiguous session rather than assuming the worst of it. Upstox has 1-minute history since Jan 2022 at exactly 375 bars per session, already verified (W3-06). Needs a table, a loader path and a `MarketDataSource` method — the engine seam is already there and takes the second `FillModel` value unchanged

> *A subtly wrong backtest produces plausible numbers that are silently false,
> and everything downstream inherits the error.* **W5-15 is that sentence
> happening.** It was caught by reading the code against §7.3, not by a test —
> which is the argument for `W5-04`'s property tests and for extending `W5-08`
> to every code path rather than to the ones that already worked.

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
- [x] **W6-06** **Done 22 Sep 2026** with `W1-13`. The real NSE calendar covers 2023–2026, which is the whole range a forward test can run in
- [ ] **W6-10** Configurable minimum window (default from B-7)
- [~] **W6-11** Console UI — `/advisor/forward-tests/[id]`, needs re-homing
- [ ] **W6-12** Descope to EOD + positional if B-1 comes back negative — build against the interface either way
- [ ] **W6-15** **New, and urgent for the calendar.** Start one real, locked, 60-session forward test **now**, while the rest is built. The engine works. This is the single scheduling decision that determines whether N6 lands in ~7 months or ~10
- [x] **W6-17** **New — done 24 Sep 2026. The engine a window is pinned to.** `forward_tests` recorded `cost_model` and nothing about the machinery, while `backtest_runs` has carried its whole `methodology` since W5-10 — and a forward test needs that fact *more*, not less. A backtest is computed once over fixed history; a forward test is re-derived every evening for a quarter by `W6-13`'s replay, so **the engine can change underneath a window that is already open**. When it does, the replay produces trades the ledger does not contain, the diff calls them `unexplained`, and the job halts — correctly, because `paper_trades` is append-only and there is no correction to apply. `W6-05` and `W5-17` would both have done exactly this. Migration `0015` adds `engine_version` and `fill_model`, **NOT NULL with no default**: the table held zero rows, verified against the live database, so there was nothing to backfill and no vintage to invent — and against a populated table it now fails loudly rather than stamping `backtest-2` onto a window that ran under something else (`W5-11`'s rule applied at the point of writing). Both join the freeze in `enforce_forward_test_lifecycle`, because the cheapest way to make a divergence disappear is to edit the row's claim about what produced it. **Pinning records the behaviour, it does not restore it** — there are no versioned engine code paths and inventing them for a vintage nobody has written would be speculative. What it buys is that a completed window is interpretable on the same terms a backtest already is, that `W5-17` is a branch on a recorded value rather than a global switch reinterpreting every window ever run, and that an incompatibility is a *diagnosis* rather than a mystery: `advanceForwardTest` refuses **before** replaying with a new `UNRUNNABLE` status, kept distinct from `HALTED` because "the ledger and the engine disagree" and "they were never compared" are different faults and only one is the record's fault. `fillModel` threads through `runBacktest` → `advanceSession`, which raises `FillModelUnavailableError` rather than silently running the implemented policy — a plausible trade under the wrong rule, written to an append-only table, is the worst outcome available. 16 of 16 freeze attacks refused (was 14), 3 new invariant rejections, 409 tests

### W7 — AI Critique Layer *(§7.11)*

- [ ] **W7-01** Read-only analysis service. **Never writes to a strategy definition** — a legal boundary, not a preference (§10.6)
- [ ] **W7-02** Structured findings, not verdicts. *"42 trades is below the threshold for statistical confidence at this win rate"* — **never** *"this strategy is weak"*
- [ ] **W7-03** Overfitting signals: parameter count vs trade count, sensitivity, oddly specific values
- [ ] **W7-04** Sample adequacy (§10.12)
- [ ] **W7-05** Regime dependence
- [ ] **W7-06** Liquidity feasibility at stated size
- [ ] **W7-07** Drawdown and tail-risk characterisation
- [-] **W7-08** ~~Plain-language explanation *for investors*~~ — no investors. **Replaced by W7-12**
- [ ] **W7-09** Full logging: input snapshot, output, timestamp, `user_acted`, `resulting_version_id` — *this log is the evidence the human authored the strategy* (§3 fact 2, Reg 16C)
- [ ] **W7-10** Test that no critique output path can reach a strategy write
- [ ] **W7-11** Critique view UI
- [ ] **W7-12** **New.** Plain-language explanation **for the author** — what their own rules actually do, which is a different job from explaining someone else's strategy to a stranger
- [ ] **W7-13** **New — the post-mortem.** §8 step 6: after a forward test completes, explain what happened and why, against the *declared hypothesis*. Without the hypothesis anchor (W15) the post-mortem is meaningless

### W8 — Iteration Ledger *(§7.14)*

- [x] **W8-01** **Done 28 Aug 2026.** `/ledger` — the complete history across every strategy, linked from the profile settings as its first entry and summarised on `/home` above the strategy list. Private: every query is scoped to one `users.id` in the WHERE clause, and the id comes from the session rather than from an argument on the wire (§10.5)
- [x] **W8-02** **Done 28 Aug 2026.** §7.14's sentence, in its own words, as the first thing on the page. **The abandoned count is set at the same size and in the same colour as the completed one** — it is not a failure tally, it is the denominator, and styling it as an error would argue the opposite of what the screen exists to say. A user with backtests and no forward test gets one further line, stating rather than scolding: backtesting against the same history until something passes is how a result gets selected rather than found
- [x] **W8-03** **Already held, confirmed 28 Aug 2026.** `/strategies/[id]` lists every version oldest-first with its hypothesis, every backtest run under it, and every forward test — running, completed and abandoned alike — with no filter, no sort control and no way to hide one. It was built this way from the start and the audit found nothing to change
- [x] **W8-04** **No filtering, no hiding, no "featured" sort** — and no API parameter that could produce one. Held so far
- [x] **W8-05** **Done 28 Aug 2026 — `npm run verify-ledger`.** Deliberately not a unit test: what needs guarding is not a function but that **no layer between the database and the screen drops an abandoned window**. A `status = 'COMPLETED'` predicate added to a query, a mapper filtering nulls, a page slicing to the most recent few — each would pass every existing test and quietly produce the flattering record. So it inserts three windows on one strategy (abandoned, completed, running — the last two so a filter that dropped the first would still leave a plausible list), drives them through the real lifecycle the triggers police, and reads them back through the same functions the page calls. 11 checks, inside a transaction that rolls back
- [x] **W8-06** **Done 28 Aug 2026.** Verified rendering against a real account — 3 forward tests, 1 live and 2 abandoned, with their genuine hypotheses and abandon reasons. **No aggregate anywhere**: no overall win rate, no total return across strategies, no "your best strategy". Each is a platform-authored performance claim about a person (§10.7). An abandoned row is styled neutrally rather than in red, because stopping a test that is not working is the product behaving correctly
- [x] **W8-07** **Done 28 Aug 2026.** `final_results` for a test that has ended, and **no figure at all for one still running**. `standing` is the only figure a running window may show and it needs a full replay per test, which is not something to do once per row — but the stronger reason is editorial: a percentage in a list of outcomes reads as an outcome, whatever badge sits beside it, and a running test does not have one yet. The console is where a provisional figure can be labelled as provisional. `verify-ledger` asserts both directions

### W9 — PaRRVA readiness

- [-] **W9-01…W9-05** **Dropped 26 Aug 2026.** PaRRVA verifies past performance claims by RAs, IAs and algo providers. We publish nothing and make no claims (§10.7), so there is nothing to verify. Closes **B-8**.

### W10 — v1 teardown *(the app contains a product we may not ship)*

The v1 items here were about invariant violations. Most are now moot because the
component itself is going.

- [x] **W10-01** Removed with the group cards, 27 Aug 2026 (W10-15)
- [x] **W10-02** Done 27 Aug 2026 — `aum: "345%"`, `accuracy: "94%"`, `rating: 4.9` and `Revenue ₹230K` went with `lib/{groups,advisor,subscription}.ts`
- [x] **W10-03** Done 27 Aug 2026 — `INP000005847` went with `lib/subscription.ts`
- [-] **W10-04** ~~Cut free-form group chat~~ — goes with groups
- [-] **W10-05** ~~Fix the "Acuracy" typo~~ — moot
- [-] **W10-08** ~~Strategy discovery~~ — **prohibited.** Cross-user strategy visibility is §10.5
- [-] **W10-11** ~~Send Signal → Preview artboard~~ — signals are gone
- [x] **W10-06** **Done 27 Aug 2026.** Teardown migration `0009`. Drop the distribution schema — groups, `group_strategies`, `group_invitations`, subscriptions, pricing tiers, signals, `market_views` — **unwinding each table's append-only trigger and grant in the same transaction**, or `db:verify` reports orphans forever
- [ ] **W10-07** Resolve any remaining v1 doc contradictions — largely moot now that `CLAUDE.md` is the single source
- [x] **W10-09** **Done 27 Aug 2026.** Ban list as a lint rule — `eslint-rules/no-performance-claims.mjs`, wired into `eslint.config.mjs` over `src/**` and attacked by RuleTester in both directions (14 valid, 10 invalid). It reads string literals, template chunks and JSX text; deliberately **not** comments, since every current mention in the codebase is a note recording what was removed. `best` and `expert` are off the list on purpose — "best bid" is an order-book level and `EXPERT` is an `experience_level` value, and a rule that fails on correct vocabulary gets suppressed within a week. **It cannot see model output at runtime**; that needs a validator on the structured output before it is stored, which is W7's job. Original note kept below because it is why the rule exists: the landing page kept "Verified Experts", "Quality Signals" and "certified experts" through the whole identity collapse because typecheck, lint, build and 276 tests cannot see marketing copy (fixed by hand 27 Aug 2026). No "verified", "top-rated", "high-performing" copy anywhere (§10.7) — now enforced rather than intended.
- [-] **W10-10** ~~Replace the `/alpha` placeholder assets~~ — moot, `/alpha` is gone (AD-18)
- [x] **W10-12** **Done 22 Sep 2026.** `x-wealth-product.md` → `CLAUDE-v1-ARCHIVED-advisor-marketplace.md`, landed in the same change as `W10-14` as required — renaming first would have orphaned the citations, re-pointing first would have aimed them at a name about to change. The file is **not** deleted: it remains the only copy of the v1 spec, and §5.4 and §5.5 still resolve only against it. Its header is now a redirect — a table mapping each surviving v1 section to its v2 home, a note that §5.4 and §5.5 have none, and an explanation of why three migrations still call it `x-wealth-product.md`
- [ ] **W10-13** **New.** Rewrite `execution-plan.md` for v2, or archive it. It plans RA acquisition, revenue share and gates G1–G7 against a business that no longer exists
- [x] **W10-14** **Done 22 Sep 2026, and the scoping was short.** 63 named citations across 34 files — but also **~60 bare `§N` references inside those same files**, which are v1 section numbers with nothing naming the document. Re-pointing only the named ones would have left most files citing two numbering schemes at once, which is worse than one stale name. Sections were mapped rather than renamed: §5.1→§8.1, §5.2→§8.2, §5.3→§8.3, §5→§8, §6→§7.3, §8→§10, §9→§11, §10→§12. **§5.4 (registration gate) and §5.5 (signals immutable once published) have no v2 equivalent** and still point at the archive, correctly. **Five files cite both documents**, so a blind remap would have turned a live `§8.12` into `§10.12` — those were done by hand, as was `PRD §5.3`, which names a third document entirely. Every resulting `CLAUDE.md §N` was then checked to resolve against a real heading. **`drizzle/0001` is excluded along with `0002` and `0006`** — this item named only the latter two and missed that `0001` carries nine citations and is equally content-hashed. One stale claim was found and corrected rather than re-pointed: `src/server/actions/strategy.ts` still said authoring was gated on a live registration, a gate deleted in `W24-06`
- [x] **W10-15** **Done 27 Aug 2026.** Removed the prohibited routes — `/groups/*`, `/group-invitations`, `/discover*`, `/chats`, `/signals`, `/investor/{discover,groups}`, `/advisor/{groups,create-group,signals,chats,pricing}`, `/portfolio/groups`, `/profile/favourites`, `/account/{choose,switch}`, and the `/alpha` tree per AD-18
- [x] **W10-16** **Done 27 Aug 2026.** Removed `src/components/{groups,chat}`, `src/server/actions/{group,invitation,signal}.ts`, and the group/signal query modules
- [x] **W10-17** **Done 27 Aug 2026.** Deleted `src/domain/signal.ts` and its 26 tests. A signal in v2 is `signal_events` — an internal record of what a strategy fired, never something delivered to another person
- [x] **W10-19** **New — done 27 Aug 2026.** Three repairs the removals forced, each a holding shape until W24: `BottomNav` pointed three of five tabs at deleted routes and is now two, centred rather than spread on five-item spacing; `/investor/home` was groups and invitations end to end and is now an honest stub, because `investor-onboarding.ts` still redirects there and it cannot vanish before the personas merge; `_shared.ts` re-exported `SignalTarget` from the deleted signal domain, so it is inlined and marked temporary — it goes with the `signals` table in W10-06
- [x] **W10-21** **New — done 28 Aug 2026. The surviving v1 screens were never wired to anything.** Found by walking the app in a browser rather than by any test, because these files import no schema and CI therefore cannot see them — the same blind spot that kept "certified experts" on the landing page through the whole identity collapse. **Five dead links**, the worst being `/investor/home` at the *end of onboarding*: every new account finished the risk disclosure and landed on a 404. Also `/choose-interests` (risk-disclosure back), `/chats` (portfolio back), `/profile/favourites` (a settings row), and an unreachable `/advisor/status` branch. **Sign-out did not sign out**: the confirm sheet ended in `<Link href="/">`, which navigated away and left the session completely intact — the cookie survived and any protected URL walked straight back in. The `signOut` action *and* a `SignOutButton` component both already existed and were both orphaned when `/account/*` went in W10-15, so the wiring was written, detached, and replaced on screen by a link that did nothing. Verified end to end: `/profile` 200 → action clears the cookie → `/profile` 307
- [x] **W10-22** **New — done 28 Aug 2026. Six pages had no auth guard and rendered fixtures.** `/profile`, `/profile/edit`, `/profile/password`, `/portfolio`, `/portfolio/add` and `/profile/logout` were reachable signed out. `ProfileIdentity` showed a hardcoded *"Raj Bansal · rajbansal@gmail.com · Member since 2021"* to whoever was signed in — worse than a dead link, because nothing about it looks broken. `/profile/edit` was three inputs and an "Update Profile" button that was a `<Link>`: it discarded everything typed. `/profile/password` was a form for a credential that does not exist — sign-in is phone OTP end to end. **Deleted**: the password page, `/portfolio/add` (its submit was a link), `FAVOURITE_STOCKS` (five stocks quoting fabricated 124% gains beside real company logos), and `RatingRing`, a 0–5 score donut that §10.7 forbids outright. **Rewired**: profile and edit now read and write the real `users` row through the existing `saveProfile` action
- [x] **W10-23** **New — done 28 Aug 2026.** `/portfolio` is an honest stub. It was showing a fabricated ₹345,000 portfolio at a 44% CAGR with five holdings each up 23%, plus a **"Via Signals"** filter tab — §10.7 and §12 for the figures, §10.5 for the tab, and the performance-claims lint rule could not see any of it because it reads words and this was numbers. `portfolio_entries` exists, holds nothing and has no reader; wiring it is **W19**, where the exposure and concentration limits live. A holdings list without limits behind it is a list of numbers, so the two land together. **Do not fill this space in the meantime** — the W10-20 rule, which this screen had already broken once
- [ ] **W10-20** **New.** `/investor/home` is a stub with nothing in it. It disappears at W24-07, when the trader's landing page becomes their strategy list. **Do not add content to it in the meantime** — a screen that fills its own empty space starts implying a capability that is not there
- [ ] **W10-24** **New — 22 Sep 2026.** `assert_no_soft_delete_columns()` raises *"Soft-delete is forbidden on append-only tables (x-wealth-product.md §5.1)"* — a **runtime error message naming a file that no longer exists**, defined in `drizzle/0001` and again in `0006`. Unlike a comment, this one reaches a human at the moment something breaks. It cannot be fixed by editing either migration (both are content-hashed); it needs a new forward migration that replaces the function with the same body and a corrected message, which in turn needs a database to apply and verify against. Land it with the next migration rather than alone
- [ ] **W10-18** **New.** Migrations `0006` and `0007` built the group slice. They stay in history (that is how migrations work); the teardown is a *new* forward migration, never an edit to a shipped one

### W11 — Investor side

- [-] **W11-01…W11-05** **Dropped 26 Aug 2026.** There is no investor persona. The risk-disclosure acknowledgement (W11-02) is the one piece worth keeping — `users.risk_ack_at` survives in the v2 data model. Carried to `W24-04`.

### W12 — Groups, signals & advisor dashboard

- [-] **W12-01…W12-07** **Dropped 26 Aug 2026. This is the prohibited surface.** §2: under SEBI's retail algo framework an algo developed by a retail investor may be used only by that investor and immediate family — not sold, rented, shared or distributed, for money or free. §10.5 makes it the single most load-bearing constraint in the product.

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

- [x] **W15-01** **Done 23 Sep 2026, and it was one file as predicted.** `src/server/ai/openrouter.ts` — OpenAI-compatible over plain HTTP, so no dependency was installed and `resolveProvider()` is still the only thing that reads a key. With `OPENROUTER_API_KEY` set it returns a model; without one it returns the stub, so the repository runs and its tests pass with no key at all. **The model must support both `tools` and `structured_outputs`, and only six of OpenRouter's twenty-one free models do** — `nvidia/nemotron-3-super-120b-a12b:free` is the default; its larger sibling `nemotron-3-ultra-550b-a55b:free` supports tools but *not* structured outputs and would fail every call. `temperature: 0`, because the same idea compiling into two different rule sets is a correctness problem, not a style one. **Three attempts, not one**: a schema-constrained answer that isn't is ordinary on a free model rather than exceptional, and non-retryable 4xx is separated from 429 so a bad key fails immediately instead of three times. `modelId` comes from the response — OpenRouter falls back to other providers, and a log recording what we asked for would be a claim rather than a record. **Free tier is a development posture**: free capacity is paid for with data, and `input_snapshot` carries the strategy logic §8.5 makes private. Production is the same id without `:free`
- [x] **W15-02** **Done 28 Aug 2026.** `ai_interactions` per AD-20 — migration `0013`, replacing `ai_critiques`. Append-only by trigger with the same two permitted mutations the old table had, `DELETE` revoked, and three CHECKs that reject rather than pass on NULL (the `0012` lesson applied at the point of writing rather than after): a HYPOTHESIS or DIGEST may name no subject, a POST_MORTEM must name its forward test, and `resulting_version_id` implies `user_acted`. **Every rejection was checked for its reason, not just for failing** — the `0011` lesson — and each names its own constraint or trigger. Holds under `service_role`, including with the revoked `DELETE` grant deliberately handed back, so it is the trigger doing the work and not the grant
- [x] **W15-03** **Done 28 Aug 2026.** Every call logged before the response is shown. **Not after, not best-effort.** `runInteraction` calls the provider, records the row, and only then returns — and it resolves both the provider and the log itself, so an ordinary call site never holds a provider and has no route to `complete`. `AiLogError` deliberately carries no output: an error is a value a caller can inspect, so an error carrying the model's answer would be the same leak wearing a different shape. `model_id` comes from the response rather than the caller, or the log would record a claim about which model ran instead of a record of it. 12 tests, including one that holds the write open and asserts the promise has not resolved, and one locking the barrel's runtime exports so a provider cannot quietly appear on it
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
- [ ] **W16-05** **Not a news feed** (§12). Events are rule primitives; there is no content surface
- [ ] **W16-06** IndianAPI as the corporate-action source — it carries bonus/dividend with record and ex dates, which is the one thing it is good for

### W17 — Annotation Layer *(§7.5 — new, cheap, ship early)*

- [ ] **W17-01** `annotations` — append-only, `target_type` / `target_id`, `structured_reason`, `note_text`, `supersedes_id`
- [ ] **W17-02** Skip reasons: news event · didn't trust it · already exposed · insufficient capital · missed the window · other
- [ ] **W17-03** Override reasons: sizing up on conviction · sizing down on uncertainty · early exit on fear · early exit on other information · other
- [ ] **W17-04** Attachable to signals, trades, tests, versions
- [ ] **W17-05** **Annotations never alter facts** (§10.8). Editing appends with `supersedes_id`; nothing is overwritten
- [ ] **W17-06** Feeds W21 directly — **W21 cannot attribute a skip without a reason recorded at the time.** Retrospective reasons are reconstructions, and reconstructions are kind to the reconstructor

### W18 — Adversarial Backtest Suite *(§7.7 — new)* ⚠️ *largest new build*

- [x] **W18-01** **Done 28 Aug 2026, and it is not textbook walk-forward.** Classic walk-forward optimises on in-sample and measures out-of-sample; **this product has no optimiser and deliberately never will** — a parameter search is the p-hacking engine §7.7 exists to defend against. So there is no fitting step to perform and pretending otherwise would be theatre. What is implemented is the half that matters: the same fixed parameters across sequential slices, each starting from full capital so the windows are comparable rather than compounding. A strategy whose entire return comes from one window has been measured once, however many years the backtest covers
- [x] **W18-02** **Done 28 Aug 2026.** Every number a trader could have chosen differently — indicator periods on both legs of both conditions, stop, target, sizing — perturbed and re-run. Periods move by whole steps because they are session counts (§7.7's own RSI-13/RSI-15 example); percentages move by a tenth of their own value, so a 5% stop is tested at 4.5% and 5.5% rather than by an absolute step that is trivial for a wide stop and drastic for a tight one. Neighbours are clamped to `LIMITS` — a variant nobody could have authored is not a comparison. Capital is deliberately excluded: sensitivity to account size is a liquidity finding, not an overfitting one
- [x] **W18-03** **Done 28 Aug 2026.** `src/domain/regime.ts`, two independent axes — a market can fall quietly and rally violently, and collapsing those into one label loses the distinction that matters. **The volatility split is an expanding median, not a whole-sample one**: splitting against the median of the entire series would label a 2021 session by how volatile 2025 turned out to be, which is lookahead bias inside the tool built to detect lookahead bias. `regime.test.ts` asserts prefix invariance and carries a negative control proving the one-line-shorter version fails it. Sessions inside the warm-up are left unclassified rather than defaulted to `SIDEWAYS`
- [x] **W18-04** **Done 28 Aug 2026, after the first version was wrong.** It computed 5th/50th/95th percentiles of the final return, and on live data printed **three identical numbers** — because compounding is multiplication and multiplication commutes, so ending equity is `capital × Π(1 + fᵢ)` and no reordering can move it. Equal-by-construction percentiles presented as a distribution are worse than no analysis: a reader takes *"even the worst 5% returned 12%"* as reassurance when it restates the single path they already had. What reordering genuinely moves is the **route** — drawdown and losing streak — so that is what is reported, with the single final return stated as one number. A test proves the invariance rather than asserting it, so the reassuring version cannot come back
- [x] **W18-05** **Done 28 Aug 2026.** Slippage escalated 0.05% → 1% until the result stops being profitable, reporting the break-even level. The most practical number in the report: a strategy that breaks even at 0.05% does not have an edge, it has a rounding error
- [b] **W18-06** Out-of-sample holdout — **used exactly once, never re-tuned against.** **Deliberately not built** — blocked on `AD-19` / **B-11**, which is a decision about *how the holdout is sealed*, not an implementation detail. Building it under the wrong assumption would mean shipping the appearance of the guarantee. The other five attacks do not depend on it
- [x] **W18-07** **Done 28 Aug 2026.** `adversarial_reports`, migration `0014`, append-only with **no permitted mutation at all** — unlike `ai_interactions`, nothing about a report is decided after it is written. Unique on `(run, suite_version, seed)` because the report is a pure function of those three, so two disagreeing rows would be a contradiction rather than a history; it also forces a version bump when the attacks change. `attacks_run` and `attacks_skipped` are stored because a suite that found nothing and a suite that failed to execute both leave `findings` empty and mean opposite things
- [b] **W18-08** **The AI's job here is to break the strategy, not bless it** — blocked on `AD-11`. **The five attacks that do the actual work need no model** and are done; what waits on a provider is the narrative framing. The computed half already refuses to bless: there is no `passed` column, no verdict field, and no code path that can conclude a strategy is sound
- [x] **W18-09** **Done 28 Aug 2026.** `/backtests/[id]/attack`, plus the entry point on the run page. Four decisions worth recording. **The report sits above the metrics, not below the trade table** — it is what qualifies every figure on that page, and a reader who has absorbed the return before reaching it has already formed the view the report exists to interrogate. **A missing report is shown as missing**: the run page says *"This result has not been attacked"* rather than staying silent, so skipping the bad news is a visible choice. **Attacks that ran and found nothing are listed as such**, because an empty report and a broken suite are otherwise indistinguishable. **No verdict, no pass mark, no filter** — every finding is on the page, most severe first, and there is no control that collapses the uncomfortable ones (§10.7, and W8-04's rule applied here). Severity is shown as a word rather than a colour alone, so the ranking survives a colour-blind reader or a printed page
- [x] **W18-12** **New — done 28 Aug 2026.** Attacking is a deliberate step, not automatic on every backtest. The suite re-runs the engine ~30 times, and §14.5 says the ceiling belongs on compute because backtests are the real COGS — attaching thirty runs to every backtest would be the most expensive possible default. The compromise is that **skipping it is visible rather than silent**. Pressing again cannot produce a friendlier answer: the unique index on `(run, suite_version, seed)` plus a deterministic suite means the second press returns the report that already exists, so the retry loop is closed by the database rather than by the UI declining to offer it
- [x] **W18-10** **New — done 28 Aug 2026. No score, ever.** §10.7 forbids platform-authored grades, and a single number is what everyone will ask for. Severity is a property of a *finding* — how badly this result is undermined by this test — and nothing aggregates severities into a total. The table has no column for one and `adversarial.test.ts` walks the entire report object asserting no key contains score, grade, rating, rank, verdict or quality. Findings are also asserted to carry digits and to avoid judgement words, so they stay observations: *"net return moves from +4.77% to −3.72% when the stop changes to 5.5%"*, never *"this strategy is weak"*
- [x] **W18-11** **New — done 28 Aug 2026. `npm run verify-adversarial`**, read-only against live bars. Unit tests prove the suite behaves correctly on designed series; this asks the different question §7.7 actually poses — **does it find anything real?** A suite whose thresholds are set politely enough to never trip on live data would pass every unit test and be worthless. On an ordinary SMA(20/50) crossover over RELIANCE and TCS, 2021–2026, it returns three findings: one profitable window in four, 30 trades against a hundred, and a losing streak that reordering stretches from 7 to 12

### W19 — Portfolio Risk *(§7.9 — new)*

- [ ] **W19-01** `portfolio_snapshots`, `portfolio_limits`, `limit_breaches`
- [ ] **W19-02** Compute: total capital at risk (sum of open R), aggregate exposure %, sector and index concentration, correlation between held positions, overlapping symbols, margin headroom
- [ ] **W19-03** Circuit breakers, **all default ON**: exposure 60% · concurrent 10 · daily loss 3% · single symbol 15% · sector 30%
- [ ] **W19-04** **Breach → new entries rejected across all strategies.** Existing positions keep being managed by their own stops
- [ ] **W19-05** **Limits block, they do not warn** (§10.9). *A limit that only warns is not a limit*
- [ ] **W19-06** Log every rejection with its reason → `limit_breaches`
- [ ] **W19-07** **Per-strategy sizing does not protect against correlated positions.** Four strategies all long midcaps is one position, not four — this module exists because that is invisible from inside any single strategy

### W20 — Trigger Proximity *(§7.10 — new, read-only)*

- [ ] **W20-01** `Midcap Bounce · HDFCBANK · 3 of 5 conditions met · RSI 34.2 (needs < 30)`
- [ ] **W20-02** **No order button. No "enter now". No size adjust. No strategy edit.** (§10.10)
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
- [ ] **W22-05** **No alerts on ordinary losing periods** (§12). An alerting system that always finds something teaches users to overfit — it manufactures the exact behaviour the product exists to prevent
- [ ] **W22-06** Durable scheduler (AD-09), shared with W6-04

### W23 — Broker Integration *(§7.15 — Stage 2)* — blocked on B-2, B-10

- [b] **W23-01** OAuth only; open APIs disallowed — blocked on B-10
- [b] **W23-02** `broker_connections` with encrypted `credentials_ref` — blocked on B-10
- [b] **W23-03** **Morning arming ritual.** Sessions terminate daily; every user re-authenticates with 2FA each morning. 08:45 push, one-tap approval, explicit **"not armed today"** state so nobody assumes coverage they do not have. *True set-and-forget is impossible in India* — blocked on B-10
- [b] **W23-04** Static IP — brokers whitelist and reject mismatches; most Indian home connections are dynamic, so traffic routes through our whitelisted infrastructure — blocked on B-10
- [b] **W23-05** 10 OPS ceiling per client account — blocked on B-10
- [b] **W23-06** 5-year audit trail of all API activity — blocked on B-10
- [b] **W23-07** Orders route to the user's own account. **No custody, no discretion** (§10.11) — blocked on B-2

### W24 — Single-persona identity *(new — the pivot's structural work)*

- [x] **W24-01** **Done 27 Aug 2026.** `users` table per §11: `id`, `email`, `phone`, `created_at`, `plan_tier`, `risk_ack_at`. Replaces `advisors` and `investors`
- [x] **W24-02** **Done 27 Aug 2026.** `strategies.user_id` replaces `strategies.advisor_id`; same for every downstream FK
- [x] **W24-03** **Done 27 Aug 2026.** One flow: phone → profile → experience → risk → home. `/choose-interests` deleted with the `interests` column — it fed a discovery feed of other people's strategies. Resolves the dead `AD-15`
- [x] **W24-04** **Done 27 Aug 2026.** Risk acknowledgement carried across — three points acknowledged separately, not one blanket agreement (the one genuinely good piece of W11)
- [x] **W24-05** **Decided 27 Aug 2026.** `/ops` deleted — the KYC review queue had nothing left to review. `platform_admins` and `requireAdmin` kept: they cost nothing and W1-16 needs them when real admin tooling arrives. with no KYC queue to review
- [x] **W24-06** **Done 27 Aug 2026.** Deleted, not left permanently allowing — a gate that always opens reads like protection and is not. `requireUser` plus per-row ownership on `user_id` replaces it (W1-09) — nothing is published in v2
- [x] **W24-07** **Done 27 Aug 2026.** Re-homed the surviving routes: `/advisor/{home,strategies,backtests,forward-tests}` → top level
- [x] **W24-08** **Verified 27 Aug 2026.** Triggers and the parameter freeze both hold after the FK rewrite, including under `service_role`; `verify-forward-test` advanced a 120-session window, reconciled ledger against engine to four decimals (0.4231% both sides) and was refused when writing a result twice. **The migration was exactly the kind of change that quietly breaks the freeze, and it did not.** Re-run `verify_invariants.sql` and `verify-freeze` against the migrated schema. The freeze is the product; a migration is exactly the kind of change that quietly breaks it

### W25 — Subscription & billing *(new)* — blocked on B-9

- [b] **W25-01** Subscription for the **tooling**. §3 fact 1: *"₹X/month for unlimited backtests" is software; "₹X/month to see the top strategies" is publishing.* Same price, same UI, entirely different legal object — the copy is load-bearing — blocked on B-9
- [b] **W25-02** **Cap compute, not features** (§14.5). Backtests are the real COGS — blocked on B-9
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

## 8. Do NOT build *(`CLAUDE.md` §12 — refuse these when they get suggested)*

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
| **We build features that weaken the discipline layer to improve conversion** | **Fatal** | §1: *every design decision that weakens it weakens the product.* Horizon's unlimited-retry model will look attractive every single quarter | §10, this table |

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
| **24 Sep 2026** | **The engine a forward test is pinned to (W6-17), and the v1 copy the screens still carried.** Migration `0015` adds `engine_version` and `fill_model` to `forward_tests`, frozen at RUNNING with everything else. The gap it closes is a consequence of `W6-13`'s replay that nobody had written down: a forward test is re-derived every evening for a quarter, so **the engine can change underneath an open window**, and when it does the replay produces trades the ledger does not hold, the diff calls them `unexplained`, and the job halts against an append-only table with no correction available. `W6-05` and `W5-17` would both have triggered it. Columns are **NOT NULL with no default** — the table held zero rows, checked against the live database, so nothing needed backfilling and no vintage had to be invented. `advanceForwardTest` now refuses *before* replaying, under a new `UNRUNNABLE` status kept separate from `HALTED`: "the ledger and the engine disagree" and "they were never compared" are different faults, and reporting both the same way sends someone hunting a corrupt ledger that is perfectly intact. **Pinning records which behaviour ran, it does not restore it** — that would need versioned engine paths, and building them for a vintage nobody has written yet would be speculative. 16 of 16 freeze attacks refused, up from 14. Separately, a UI audit found the pivot's copy still live on five screens: the abandon box promised *"Published with the test, permanently, on your public profile"*, and `/risk-disclosure` — the one screen a user must tick to proceed — still described advisors as SEBI-registered Research Analysts. §8.5 is the constraint the whole compliance structure rests on, and the product was advertising the opposite of it. `no-performance-claims` now covers §8.5 alongside §8.7, which caught a sixth violation in a server action. The rule fired on the *replacement* copy too — the sentence stating the guarantee names the same nouns as the sentence breaking it — so the pattern requires a visibility verb rather than the nouns alone; a rule that flags denials earns a blanket suppression, which is the same reasoning that kept `best` and `expert` off the original list. 409 tests. |
| **23 Sep 2026** | **Revisions are compiled too, and the diff is the point (W4-12).** `/strategies/[id]` revised through a form: find the field, retype the number. It worked, and it quietly invited the thing this product exists to prevent — a form full of editable numbers is an invitation to sweep them, and sweeping parameters against the same history is p-hacking with extra steps. *"Widen the stop to 7% because three exits landed inside noise"* is a sentence with a reason in it, and the reason is what the ledger is for. **The compiler is not trusted with scope.** A model told to widen a stop can re-round the sizing on the way past, and a rendered rule set shows what the rules *now are*, not what moved — so the screen shows a field-level diff computed server-side by `diffDefinitions` against the head version **read by id, never accepted from the client**: a definition sent over the wire could differ from the recorded one, and the diff would then be against rules that were never saved. The prompt asks for one change; the diff is how the user checks. `strategy_versions` is append-only, so a version that changed more than its author intended is permanent and its lineage misleading. `definitionRows` is shared by the review table and the diff so the two cannot name the same field differently, and a test pins their lengths together — a field the diff cannot express is a field a revision could change silently. `StrategyForm` (427 lines) is deleted rather than left unreachable. 400 tests. |
| **23 Sep 2026** | **The holiday calendar was wrong, and the backfill refused to load (W1-13 corrected).** Yesterday's calendar was transcribed from three republications of the exchange circular. It was wrong in eight places across four years, and the first symptom was `npm run load-market-data` rejecting **all six instruments**: three dates it called closed — 2023-04-21, 2023-06-28, 2024-04-10, every one of them Eid — had printed real bars. The source marked them *Morning Off*, a commodity-segment half-day, and NSE equity traded normally. **That is `assertValidSeries` working**: a wrong holiday is caught loudly at ingestion instead of quietly shifting every session count, and it surfaced within a day of being written. Reconciling against printed bars in both directions also found **five missing** holidays inside the covered range — both Eid dates off by one day, plus the Ram Mandir consecration and two election closures that no generic calendar page carries. Those are the dangerous ones: nothing rejects a missing holiday. The list is now **generated from the prints rather than transcribed** — 92 holidays verified 2020-01-01 → 2026-09-22, six forward-dated from the circular, eight observed weekend sessions — and `NSE_CALENDAR_COVERS` separates `verifiedTo` from `to`, because a circular and a printed bar are different kinds of fact. Diwali Laxmi Pujan stopped needing its override: a date that traded is simply not a holiday. Three tests changed with the model, including the density floor, which now counts **weekday closures** (12–17 a year observed) rather than gazetted holidays — about a third of the published list falls on a weekend. Backfill green: 7,366 bars across 6 instruments. 394 tests. |
| **23 Sep 2026** | **Two decorative fields removed, and the strategy form retired (W4-12, W10-22 class).** `/complete-profile` carried **DOB and Gender as `readOnly` inputs with a chevron and a placeholder written to read as a value** — "19-08-1998", "Male". No state, no picker, no save: two of five fields were Figma decoration on a screen that looked complete. Same failure as the hardcoded "Raj Bansal", invisible to CI for the same reason — the file imports no schema. **Removed rather than wired**: neither has a column in the live schema or in §9, no feature reads age or gender (the KYC that justified them went with W2), and date of birth is PII that §12 requires encrypted at rest and access-logged. Wiring them would have bought that obligation and nothing else. Separately, `/strategies/new` **is now the compiler only** — the hand-filled form is gone. Not because it was broken; it worked, and `ReviseForm` still uses the same component to edit a version. Because offering both framed the compiler as a shortcut past the six mandatory components rather than the way to reach them, and a user who suspects the fast path is the lesser one takes the slow path and resents it. The guarantees are untouched: the compiler proposes, the user reviews every rule and saves, `createStrategy` validates what it always validated. 393 tests. |
| **23 Sep 2026** | **The compiler's chat UI (W4-12).** `/strategies/new/chat`: describe an idea, answer only what could not be assumed, review the compiled rules, declare the hypothesis, save. **The review step is not a confirmation dialog** — §8.6 makes model output advisory, so the whole definition is rendered in the same words the strategy page uses and the user presses save. A flow that compiled straight into the database would make the model the author, destroying the evidence `ai_interactions` exists to produce. Assumptions are shown above the rules rather than folded away; `live: false` renders a banner saying no model was involved, so stub output can never be mistaken for a compile. `createStrategy` now returns its `versionId` so `markCompileActed` can link the interaction to what resulted from it — the link is the evidence the human authored it, and it cannot be reconstructed later without guessing. One latent bug fixed on the way: `TextAreaField` held internal state and then spread `...props` over it, so controlled callers worked by accident while the character counter kept reading a value it no longer owned — a `limit` on a controlled field rendered a number that never moved. 393 tests. |
| **23 Sep 2026** | **The strategy compiler, and the first live model (W4-12, W15-01; AD-11 closed for dev).** Plain English in, `StrategyDefinitionV2` out. `resolveProvider()` was the one function AD-11 was always going to change and it was: `openrouter.ts` is a single `fetch`, no dependency installed. **The model choice is a capability question, not a price one** — §7.11 requires structured output, and only six of OpenRouter's twenty-one free models support both `tools` and `structured_outputs`; the obvious big one (`nemotron-3-ultra-550b-a55b:free`) supports tools but not schemas and would have failed every call. **The compiler emits data, never code.** Tools in this category hand the user a Pine script, and that forfeits the CHECK constraint, the sensitivity sweep and the parameter freeze in one move. **Model output is treated as untrusted input**: the draft type is deliberately not the definition type, and the only bridge re-runs the real validator with the real catalogue — nine cases assert the compiler cannot produce what the authoring form would reject. Two bugs found while writing the tests, both mine: `toOperand` recorded that `{kind:"PRICE", period:14}` was wrong and then returned a usable operand anyway, so the issue was collected and discarded — recoverable-but-wrong is now fatal, because a silently dropped period compiles a strategy subtly unlike the one described; and the test asserting the schema never asks for code failed on its own schema, because *description* contains *script*. Retries are three, not one: schema-invalid answers are ordinary on a free model. Free tier is development only — free capacity is paid for with data and `input_snapshot` carries the strategy logic §8.5 makes private; production is the same model id without `:free`. 393 tests. |
| **22 Sep 2026** | **The v1 spec archived and its citations re-pointed (W10-12, W10-14).** `x-wealth-product.md` → `CLAUDE-v1-ARCHIVED-advisor-marketplace.md`, with the rename and the re-pointing in one change because either alone breaks the other. **The scoping was short by about half**: 63 named citations across 34 files, plus ~60 bare `§N` references inside those same files carrying v1 numbering with nothing to identify it — re-pointing only the named ones would have left most files citing two schemes at once. Sections were mapped, not renamed: §5.1→§8.1, §5.2→§8.2, §5.3→§8.3, §6→§7.3, §9→§11, §10→§12. **§5.4 and §5.5 have no v2 home** — there is no registration to gate and nothing is published — so they still point at the archive, which is why the file is kept rather than deleted. Three traps: **five files cite both documents**, where a blind remap turns a live `§8.12` into `§10.12`; **`PRD §5.3`** names a third document; and **`drizzle/0001` carries nine citations** and is content-hashed, which the original scoping missed while naming `0002` and `0006`. All three handled by hand, and every resulting citation was then checked to resolve against a real `CLAUDE.md` heading. One stale claim was corrected rather than carried across: `src/server/actions/strategy.ts` still described a registration gate deleted in `W24-06`. The archive's header is now a redirect table. New at `W10-24`: the soft-delete guard's **runtime error message** still names the old file and needs a forward migration. 371 tests. |
| **22 Sep 2026** | **The real NSE holiday calendar (W1-13, W6-06).** `PLACEHOLDER_CALENDAR_2026` carried **three holidays for one year** and was consumed in eight places, including `planned_end_at` and every ingestion check. It never produced an error — a 60-session window opened 2 March 2026 reported an end date of 22 May when the sixtieth session falls on 2 June, and the number was simply wrong. The engine was insulated by design and stayed correct throughout: `sessionsInWindow` counts from bars rather than the calendar and completion is `sessions.length >= plannedSessions`, so **no test could ever close short**. What the drift actually ate was alarm headroom — `check-forward-tests` allows a 21-day overrun precisely because holidays push a test past its planned date, and the placeholder was spending twelve of those days before a real fault could start accruing. Now 71 holidays across 2023–2026, cross-checked per year across three republications of the circular. **The trap was Diwali Laxmi Pujan**: a trading holiday on which the Muhurat session still prints prices, so a bar exists on all four of them. Listing it as a holiday alone would have rejected genuine data, which is the mistake the six weekend sessions already taught once — each is now in `holidays` *and* `specialSessions`, which wins, so both facts are recorded. Five tests replace the one that asserted the calendar was incomplete, including a per-year density floor, because a truncated year is invisible otherwise. 371 tests. |
| **22 Sep 2026** | **The freeze proof runs in CI (W5-16, two of four).** Until now CI ran typecheck, lint, tests, build and `verify_invariants.sql` and **none** of the `verify-*` scripts — which is why two of them sat broken for a day in August, and why the parameter freeze, the single most load-bearing invariant in the product, was only ever as proven as the last time somebody remembered to run it by hand against the hosted database. That became acute rather than theoretical when the hosted database stopped resolving: for a fortnight there was **no way to prove the freeze at all**. `verify-freeze` and `verify-ledger` now run on every push against CI's own Postgres container. Two blockers, neither of them the fixtures problem this was filed as: `ssl: "require"` was hardcoded and a container does not speak TLS, so it died on `ECONNRESET` before landing an attack; and both scripts required a pre-existing user row, which is exactly what tied them to a populated database. TLS is now decided from the host rather than an env var — no flag can drop it on the way to the real database — and each seeds its fixture account inside the transaction it already rolls back, so nothing is written either way and an existing account is still preferred. Verified by reproducing the entire CI job against a throwaway Postgres 17 cluster, on an empty database and a populated one: 14 of 14 attacks refused, 12 of 12 ledger checks passed. 367 tests. |
| **28 Aug 2026** | **The iteration ledger (W8-01/02/05/06/07; W8-03 confirmed).** `/ledger` — every forward test this account has started, across every strategy, newest first, with no filter and no parameter that could become one. §7.14's counts lead the page because the denominator is the product: three completed windows mean one thing beside nine abandoned ones and something else entirely beside none. **The abandoned count is the same size and colour as the completed one**, and an abandoned row is not styled as an error — stopping a test that is not working is the product behaving correctly. No aggregate of any kind: no overall win rate, no total return, no best strategy, each of which is a §10.7 claim about a person. `W8-07`'s trap is closed by showing no figure for a running test at all. `npm run verify-ledger` is the W8-05 assertion and is deliberately an end-to-end read rather than a unit test, because what it guards is that no layer between the database and the screen drops an abandoned window. Verified rendering against a real account. 367 tests. |
| **28 Aug 2026** | **The v1 screens that survived the teardown, audited route by route (W10-21/22/23).** Found by walking the app in a browser; none of it was visible to CI, because these files import no schema. **Five dead links**, the worst at the end of onboarding — a new account acknowledged risk and was pushed to `/investor/home`, deleted in W10-15, so every signup ended on a 404. **Sign-out did not sign out**: the sheet's button was `<Link href="/">`, so the session survived and any protected URL let you back in; both the `signOut` action and a `SignOutButton` had existed all along and been orphaned. **Six pages had no auth guard**, and the profile showed a hardcoded "Raj Bansal" to whoever was signed in. `/profile/edit` discarded everything typed; `/profile/password` was a form for a credential the product does not have. `/portfolio` was showing a fabricated ₹345,000 at 44% CAGR behind a "Via Signals" tab — §10.7, §12 and §10.5 in one screen, invisible to the lint rule because it was numbers rather than words. Every internal link now resolves to a route that exists, every page has a back affordance, and sign-out was verified end to end. 367 tests. |
| **28 Aug 2026** | **Attack report UI (W18-09, W18-12).** `/backtests/[id]/attack`, with the entry point on the run page placed *above* the metrics — the report is what qualifies those figures, and a reader who has absorbed the return first has already formed the view it exists to interrogate. A run with no report says so rather than staying quiet, and attacks that ran without tripping are listed as having run, because an empty report and a broken suite look identical otherwise. Attacking is deliberate rather than automatic (~30 engine runs against §14.5's compute ceiling), and pressing again returns the existing report — the unique index closes the retry loop rather than the UI declining to offer it. **Verified end to end against a real recorded run**, not a fixture: 15 trades, four findings, one profitable window in four. |
| **28 Aug 2026** | **The adversarial suite (W18-01…05, 07, 10, 11).** Five of the six attacks, ranked into an append-only `adversarial_reports` (migration `0014`), verified against live bars by `npm run verify-adversarial`. Three things worth recording. **The Monte Carlo was wrong first time**: it reported final-return percentiles, and on live data printed three identical numbers — compounding commutes, so reordering cannot move ending equity. Equal-by-construction percentiles dressed as a distribution are worse than no analysis, so it now reports the drawdown and losing-streak distributions, which reordering genuinely moves, and a test proves the invariance so the reassuring version cannot return. **The regime classifier nearly shipped its own lookahead**: splitting volatility against the whole-sample median would label a 2021 session by how 2025 turned out. It uses an expanding median, with a negative control proving the shorter version fails prefix invariance. **Walk-forward is not textbook and says so** — there is no optimiser in this product and never will be, so the in-sample fitting step does not exist and pretending otherwise would be theatre. No score anywhere, asserted by walking the whole report object. 367 tests. |
| **28 Aug 2026** | **W5 closed to everything that does not need an outsider (W5-04, 05, 07, 08, 11, 13, 14, 15).** The headline is `W5-15`: **the engine never read `targetPercent`.** Validated, stored, CHECK-enforced, named by §7.3 — and ignored by every line of the execution path. Latent rather than live (no UI exposed it, 0 of 6 versions set one), but `W4-12` compiles plain English and *"take profit at 20%"* would have pulled the trigger. Fixing it makes the intrabar problem load-bearing, so `W5-13` landed with it: a session reaching both levels is a **stop-out, always**, recorded per run as `methodology.execution.fillModel` and shown on the screen. `W5-04` is property-based rather than fixture-based — prefix invariance at every length, with a negative control that peeks and must be rejected — so it catches leaks nobody has written yet. `W5-08` extended to the target path, which is exactly the gap that let `W5-15` survive. Engine bumped to `backtest-2`; runs stored under `-1` describe a different execution model and their methodology says so. 336 tests. |
| **28 Aug 2026** | **Two verification scripts had been silently broken for a day, and CI could not see either (W5-16).** `verify-standing` spread a top-level `instruments` key over a V2 definition, so the universe resolved to empty and it died on `WINDOW_NOT_OPEN` — broken by `W4-08` on 27 Aug, hidden by an `as never` cast that switched off the one check that would have caught it. `verify-freeze` was broken twice over: it still selected from `advisors`, dropped in `0010` the same day, and it built its fixture with `${JSON.stringify(x)}::jsonb`, which stores a jsonb *string* rather than an object — harmless until `0011` added a constraint whose first test is `jsonb_typeof(definition) = 'object'`. **The freeze is the product, and its proof had not run since the identity collapse.** Both fixed; 14 of 14 attacks refused again, and `verify-standing` passes 11 checks against a real 657-session window. The reason neither was noticed is that CI runs `verify_invariants.sql` and none of the four scripts — tracked at `W5-16`. |
| **28 Aug 2026** | **`CLAUDE.md` and `trading-domain-primer.md` moved into the repo.** Both had sat on the author's Desktop since the 26 Aug pivot — unversioned, unbacked-up, and unreadable by any tooling — while this file cited `CLAUDE.md` by section number roughly fifty times and named it the document to read before writing any code. The only `CLAUDE.md` ever committed was a one-line stub, deleted in `8e53443`. A `CLAUDE.md` at the repo root is also auto-loaded as project instructions, so the source of truth now reaches every session by default instead of by memory. `x-wealth-product.md` was left alone: it is byte-identical to the Desktop's archived v1 copy, so nothing needed importing, and renaming it belongs with `W10-14`'s 62 citations rather than ahead of them. |
| **28 Aug 2026** | **The AI logging spine (W15-02, W15-03; AD-20, AD-21 decided).** Migration `0013` replaces `ai_critiques` with `ai_interactions` — the old table anchored every row to a forward test, which is the one thing four of the five v2 context types do not have, and it held zero rows so nothing recorded was rewritten. `src/server/ai/` is the provider interface, a stub, and `runInteraction`, which does not hand back model output until the row is committed. **Deliberately built with no provider**: `AD-11` needs an account, a key and billing, and none of `W15-02`/`W15-03` needed a model to be right — the property that matters is an ordering, and proving it needs a log that can be made to fail, which a real table cannot do. Three CHECKs written `coalesce(..., false)` from the start rather than after the fact, and every negative case run individually to confirm it was rejected by its own constraint rather than by a typo. `db:verify` now covers the new table in its `service_role` phase; with the revoked `DELETE` grant handed back inside a rolled-back transaction, the trigger still refuses. 301 tests. |
| **27 Aug 2026** | **Performance-claims lint rule (W10-09).** The one guard that survived the pivot unchanged and had been open since the file was written. Nothing else in CI can read prose — typecheck, lint, build and 276 tests all passed while the landing page pitched "certified experts" — so this reads string literals, template chunks and JSX text across `src/**` and fails on §10.7 language. Attacked in both directions, because a rule that flags legitimate trading vocabulary ("best bid") gets suppressed within a week and then protects nothing. `layout.tsx`'s page description, which renders nowhere in the app and therefore survived every previous pass, went with it. |
| **27 Aug 2026** | **Strategy definition v2 (W4-08, W4-09, W4-11).** Versioned rather than edited: a `version:1` definition is frozen inside the RUNNING forward test and six `strategy_versions` are append-only, so `StrategyDefinitionV1` is frozen, V2 is what gets authored, and `resolveDefinition` normalises both into one shape the engine consumes. Sizing now derives quantity from the stop. Liquidity floor applied in `signalsFor`, backward-looking, gating entries and not exits. Migrations `0011`/`0012` add the completeness CHECK — **`0011` enforced nothing**, because a CHECK passes when its expression is NULL and a missing key yields NULL rather than false; the ad-hoc test that "proved" it reused one `version_no`, so every attempt after the first failed on the unique index and reported a pass. `verify_invariants.sql` caught it on the second case. Two engine bugs found and fixed on the way: risk sizing divided paise by price ticks (100× too large, silently), and a just-started forward test halted the evening job nightly because its window opens on the *next* session. 288 tests. |
| **27 Aug 2026** | **Landing page corrected.** It survived the identity collapse untouched — no schema imports, so nothing in CI could see that it still pitched "quality trading signals by certified experts", ticked "Verified Experts"/"Quality Signals" (§10.7 names both), and routed an Advisor tab at a deleted route. |
| **27 Aug 2026** | **Identity collapsed (W24) and the distribution schema dropped (W10-06).** Migrations `0009` and `0010` applied to the live database: 22 tables → 12. `advisors` + `investors` → one `users` table, `strategies` and `portfolio_entries` repointed, KYC and PaRRVA fields gone, `interests` gone with the discovery feed it fed. `requirePublishingRights` deleted rather than left permanently allowing. Routes re-homed to top level; `/advisor/*`, `/investor`, `/ops`, `/choose-interests` removed. **W24-08 verified** — the freeze and the append-only triggers survived the FK rewrite, under `service_role`, and the engine still reconciles to four decimals. Data intact: 2 users, 4 strategies with owners, 5 versions, 5 backtest runs. Also fixed `db-migrate.mjs`, which reported "✓ migrations applied" having applied nothing because `migrate()` reads the journal rather than the folder — it now refuses to start when a numbered migration on disk has no journal entry. 276 tests green. |
| **27 Aug 2026** | **Distribution surface removed (W10-01, W10-02, W10-03, W10-15, W10-16, W10-17, W10-19; AD-18 closed).** 104 files, ~9,200 deletions on branch `v2-teardown`, tagged `v1-marketplace-final` first. Gone: groups, invitations, subscriptions and payments, signal composition and feeds, discovery, chat, the `/alpha` second pass, persona switching, the `/screens` Figma index, and the fixture modules carrying the hardcoded `aum`/`accuracy`/`rating` figures and the real-format SEBI number. Kept deliberately: `/portfolio` and `/profile` have no cross-user surface — superseding them is a W24/W19 scope question, not a legal one — and the onboarding flows are persona-specific rather than prohibited. **The schema is untouched on purpose**: dropping the distribution tables must unwind each one's append-only trigger and revoked grant in the same transaction (W10-06). 301 tests green, typecheck, lint and build clean. |
| **26 Aug 2026** | **Evening scheduler live (AD-09, W6-04, W6-16, W3-11).** `.github/workflows/forward-tests.yml` runs load → advance → health check on weekdays at 16:45 IST, serialised so two runs cannot write to append-only tables at once. New `scripts/check-forward-test-health.mts` is the alarm the other two jobs cannot raise: they exit non-zero when they crash, but a stale vendor feed makes a stalled test look exactly like a quiet market. It found real staleness on its first run — bars six days old — and went green after a load. **The 60-session clock can now start (W6-15).** |
| **26 Aug 2026** | **Rewritten for the v2 direction.** `CLAUDE.md` replaces `x-wealth-product.md` as the source of truth: single-persona AI strategy lab, no advisors, no investors, no distribution. **Dropped:** W2 (SEBI KYC), W9 (PaRRVA), W11 (investor), W12 (groups/signals), W13 (payments/attribution), blockers B-3/B-4/B-8, milestones M0–M8, decisions AD-14/15/16. **Added:** W15 hypothesis workbench, W16 event awareness, W17 annotations, W18 adversarial suite, W19 portfolio risk, W20 trigger proximity, W21 execution gap, W22 review cadence, W23 broker integration, W24 identity collapse, W25 billing; milestones N0–N8; blockers B-9/B-10/**B-11**; decisions AD-17…AD-22. **Restated:** B-1, B-2, B-5. Current state re-audited — 327 tests across 18 files, 9 migrations, backtest + forward-test engines live against real Upstox bars, AI at zero. |
| 24 Aug 2026 | **W6 forward-test engine live.** One execution model shared by both engines (`session-step.ts`), replay-not-cache each evening, `npm run verify-freeze` landing 14 raw-SQL attacks on the parameter freeze, and the `standing` vs `metrics` distinction — a running test has two net-return figures and only one has paid its exit charges. Verified on a real 654-session window. |
| 21 Aug 2026 | **Market data layer live.** Upstox chosen for OHLCV: adjusted series verified across the RELIANCE 1:1 bonus, daily back to 2000, 1-minute since 2022 at 375 bars/session. IndianAPI is close-only and demoted to corporate-action events. Open: `tick_size` units, redistribution terms, survivorship universe. |
| 20 Aug 2026 | Advisor groups + strategy sharing shipped (migrations `0006`, `0007`). **Superseded 26 Aug 2026 — this is the prohibited surface under v2 §10.5.** |
| 19 Aug 2026 | Investor flow wired; AD-15 resolved in favour of the Investor screens. **Both personas dropped 26 Aug 2026.** |
| 19 Aug 2026 | **W4 strategy authoring live.** Structured definition, validator rejecting unevaluatable strategies, `createStrategy` / `reviseStrategy` — a revision is a new row, never an update, confirmed against the live database with a direct `UPDATE` still refused by the trigger. Survives the pivot intact. |
| 19 Aug 2026 | **Fixed: database connection starvation.** `db()` cached a `max: 1` pool in module scope; Next's dev HMR leaked one per reload. Sign-in 25s → 0.31s. Would have bitten production too. |
| 19 Aug 2026 | **Fixed: a verified advisor was re-asked for every detail on sign-in.** Destination now computed from the record. Found while fixing it: two onboarding pages rendered for signed-out visitors. |
| 19 Aug 2026 | Advisor signup → verification working end to end on the live database. **Dropped 26 Aug 2026 with W2.** |
| 19 Aug 2026 | Migrations applied live and invariants verified on them (W1-02, W1-05, W1-06). Append-only proven to hold under `service_role`. Three defects found: `auth.users` DDL fails on Supabase permissions; `drizzle-kit migrate` exits 0 having done nothing when `pg` is missing; `DIRECT_URL` was on the transaction pooler. |
| 18 Aug 2026 | **Stack decided: Supabase + Drizzle on Vercel.** AD-01/02/03/04/10/13 closed. Supabase gotchas list added. |
| 18 Aug 2026 | Schema and invariant constraints written (W1-03, W1-04). 15 tables, 11 enums, 9 triggers, 16 CHECKs. `verify_invariants.sql` negative-controlled. Two gotchas recorded: event triggers need superuser; `schemaFilter` leaks `auth` on the first migration. |
| 18 Aug 2026 | File created. 53 screens built, zero backend. W0–W14, B-1…B-8, AD-01…AD-15 opened. |
