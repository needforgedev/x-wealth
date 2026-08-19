# X-Wealth — Delivery Plan & Tracker

**Owner:** J · **Started:** 18 Aug 2026 · **Last updated:** 18 Aug 2026

This is the working tracker. It turns the PRD into numbered, checkable work and
records what is actually done. Update it as work lands — it is the single place
that answers "where are we?"

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

### The four documents and how they relate

| File | What it is | When to read it |
|---|---|---|
| `PRD X Wealth Agent for Digital Asset Markets.md` | What we are building and why | Product questions |
| `x-wealth-product.md` | The engineering spec — invariants, data model, do-not-build | **Before writing any code** |
| `execution-plan.md` | Business plan — 4 parallel tracks, kill criteria, gates G1–G7 | Weekly, at gate reviews |
| `plan.md` (this file) | Engineering delivery + live status | Daily |

> **Note:** `execution-plan.md` refers to "CLAUDE.md §5.1 / §6 / §9" nine times.
> Those sections actually live in `x-wealth-product.md` — `CLAUDE.md` is a
> one-line include of `AGENTS.md`. See `W10-06`.

---

## 1. Where we are today

**Honest summary: we have a complete, well-built, entirely static front end and
no product underneath it.** Every screen in the Figma file is implemented.
Nothing behind them exists — no database, no auth, no API, no engine.

### Done

- [x] **D-01** Next.js 16 / React 19 / Tailwind 4 scaffold, Turbopack, TS strict, eslint clean
- [x] **D-02** Design system: 19 UI primitives in `src/components/ui/` lifted from Figma tokens
- [x] **D-03** All 53 artboards built across the Figma file's three pages, indexed at `/screens`
  - Investor page — 18 screens + 2 sheets
  - Advisor page — 26 screens + 3 sheets
  - Alpha page — 16 screens (second pass at auth/onboarding/home)
- [x] **D-04** Figma `.fig` decoder (Kiwi schema parser) for extracting exact specs without the Figma app
- [x] **D-05** PRD, engineering spec (`x-wealth-product.md`) and business plan (`execution-plan.md`) written

### Not done — everything else

| Layer | State |
|---|---|
| Dependencies | `next`, `react`, `react-dom`. Nothing else. |
| Database | None. No schema, no migrations, no ORM. |
| Auth / sessions / roles | None. The OTP screens are UI only. |
| API routes / server actions | None (`src/app/api` does not exist). |
| Strategy builder, backtest, forward test, AI critique | Not started. **This is the product.** |
| Market data layer | Not started. |
| Tests / CI | None. No test runner installed. |
| Admin / ops tooling | None. |
| Payments | None. |

### The gap, stated plainly

The PRD's differentiator is §5.4 (forward test) + §5.6 (iteration ledger) — the
honest, complete performance record. **Neither has a single line of code, and
the forward test is blocked on an unresolved legal question about market data
(B-1).** Everything currently built is Phase 2 surface area (distribution),
while the PRD says Phase 1 is advisor tooling with no investors at all.

---

## 2. Blockers board

Nothing in Phase 1 or Phase 2 ships until these are answered. `execution-plan.md`
Tracks A/B/C exist to close them. **These are not engineering tasks.**

| ID | Question | Gates | Owner | Status |
|---|---|---|---|---|
| **B-1** | Can a platform serving registered RAs use real-time / near-real-time price data for a paper-trading validation engine, given the 24 May 2024 circular as revised 1 Jul 2026 (30-day lag for educational use)? If not, what latency is defensible? | W3, W6 scope | Counsel | ☐ Open |
| **B-2** | Does an AI critique layer + strategy builder + paper-trading engine make us (a) an RA, (b) an algo provider under the retail algo framework, or (c) neither? Does advisory-only, never-auto-applied output change the answer? | **Everything** | Counsel | ☐ Open |
| **B-3** | Can an unregistered technology platform take a percentage of a registered RA's subscription income? If not, is a flat SaaS licence fee permissible? | W12, W13 | Counsel | ☐ Open |
| **B-4** | What can we display about forward-test performance without making a "performance claim" requiring PaRRVA verification? Are raw trade logs + computed metrics, uncharacterised, sufficient? | W8, W9, W11 | Counsel | ☐ Open |
| **B-5** | Will registered RAs actually use this — and will they publish failed attempts? (15 interviews) | **Everything** | J — non-delegable | ☐ Open |
| **B-6** | What data can we get, at what latency, cost, and redistribution terms? | W3, W5, W6 | Developer | ☐ Open |
| **B-7** | Minimum forward-test window — needs statistical justification, not a guess. Placeholder 60 sessions. | W6 | J + quant | ☐ Open |
| **B-8** | PaRRVA export schema — exact specification unconfirmed. | W9 | J | ☐ Open |

> **B-2 and B-5 are existential.** B-1 is not fatal: losing real-time costs us
> intraday and leaves positional intact (PRD §8 Track B).
>
> **Note a document inconsistency:** PRD §12 lists blocker 2 as already answered
> "no", while `execution-plan.md` gate G3 treats it as open with ₹1.5–3L of legal
> budget allocated to answering it. Resolve which is true — see `W10-07`.

### What is safe to build before the blockers close

Only **W1 (foundation)** and the **interface** half of **W3 (data layer)**.
Both are provider- and monetisation-agnostic. Everything else waits.

Do not start W4–W9 before B-2 and B-5 are answered. `execution-plan.md` is
explicit: *"Never let D get ahead of a blocking answer from A, B or C."*

---

## 3. Route map — what we have vs. what the PRD needs

| PRD §5 module | PRD verdict | UI status | Logic status | Workstream |
|---|---|---|---|---|
| 5.1 Advisor onboarding + KYC | Reuse as-is | ✅ `/advisor/kyc`, `/advisor/complete-profile` | ❌ | W2 |
| 5.2 Strategy Builder | **New** | ❌ none | ❌ | W4 |
| 5.3 Backtest Engine | **New** | ❌ none | ❌ | W5 |
| 5.4 Forward Test Console | **New — the core** | ❌ none | ❌ | W6 |
| 5.5 AI Critique Layer | **New** | ❌ none | ❌ | W7 |
| 5.6 Iteration Ledger | **New** | ❌ none | ❌ | W8 |
| 5.7 Signal Composer | Reuse + extend | ✅ `SendSignalSheet` | ❌ | W12 |
| 5.8 Groups & Distribution | Reuse; **cut chat** | ✅ built (incl. chat — must go) | ❌ | W12, W10 |
| 5.9 Investor Onboarding | Reuse + add risk ack | ✅ built | ❌ | W11 |
| 5.10 Strategy Discovery | **New** | ⚠️ group discovery ≠ strategy discovery | ❌ | W11 |
| 5.11 Portfolio | Reuse + attribution | ✅ built | ❌ | W13 |
| 5.12 Advisor Dashboard | Reuse + extend | ✅ `/advisor/chats` hero | ❌ | W12 |
| 5.13 Subscription & Payments | Revisit | ✅ screens built | ❌ | W13 |

**Read across that table:** every module the PRD marks "reuse" has UI and no
logic. Every module the PRD marks "new" — which is the entire differentiator —
has neither. **Roughly 6 screens of new advisor-tooling UI do not exist yet**
(strategy builder, backtest results, forward-test console, critique view,
iteration ledger, public profile).

---

## 4. Milestones

| # | Milestone | Contains | Exit condition | Gate |
|---|---|---|---|---|
| **M0** | Blockers closed | B-1…B-6 | Written legal opinion; 15 interviews synthesised; data terms in hand | G1, G2, G3 |
| **M1** | Foundation | W1 | Append-only constraints proven by a test that tries to UPDATE and fails | — |
| **M2** | Verified advisor | W2 | An advisor signs up, submits docs, an admin verifies them, publishing unlocks | — |
| **M3** | Authored + backtested | W3, W4, W5 | A strategy backtests cost-inclusive and reconciles to hand-calculation | **G4** |
| **M4** | Forward test runs | W6 | A locked strategy runs to completion on paper; parameters provably frozen | **G5** |
| **M5** | Critique + ledger | W7, W8, W9 | Critique returns structured findings; profile shows published *and* abandoned | — |
| **M6** | **Advisor product ships** | M2–M5 + W10 | `x-wealth-product.md` §11 "done" list passes end to end. **Sellable as SaaS.** | **G6** |
| **M7** | Distribution | W11, W12, W13 | Investor subscribes, receives a signal bound to a real forward test | — |
| **M8** | Beta | W14 | 10 advisors, 100 investors, invite only | **G7** |

> **M6 is a shipping point, not a checkpoint.** `execution-plan.md` argues for
> selling the advisor tool standalone before building M7: it sidesteps B-3 and
> most of B-4, tests the hard assumption first, and earns revenue ~4 months
> earlier. Decide at `AD-14`.

### Timeline — advisor product with AI critique (W7) deferred

Assumes Supabase + Drizzle, blockers closed, and that the developer is working
full time with Claude Code. Excludes W0 (blockers), W9 (PaRRVA, blocked on B-8)
and W11–W14 (distribution).

| Workstream | 1 dev | 2 devs | Notes |
|---|---|---|---|
| W1 Foundation | 2.5 wk | 1.5 wk | Supabase auth + storage saves ~1.5 wk vs. rolling our own |
| W2 Advisor onboarding + KYC | 2 wk | 1.5 wk | Manual review queue is deliberately simple |
| W3 Data layer | 2.5 wk | 2 wk | Corporate actions are the fiddly part; can overlap W2 |
| W4 Strategy builder | 3.5 wk | 2.5 wk | Includes **new UI with no artboards to work from** |
| W5 Backtest engine | 4.5 wk | 3.5 wk | ⚠️ Includes the hand-calculation reconciliation suite |
| W6 Forward test engine | 5.5 wk | 4 wk | Reuses W5's execution model; adds scheduler + fill realism |
| W8 Iteration ledger + profile | 2 wk | 1.5 wk | Can overlap W6 |
| W10 Invariant remediation | 1 wk | 0.5 wk | Slots in anywhere |
| **Code-complete** | **~22 wk** | **~15 wk** | ≈5 months · ≈3.5 months |

**Add ~25% for the unknowns** you always hit on the first regulated build:
**~27 weeks (1 dev) / ~19 weeks (2 devs)**.

#### Two things this estimate does not buy you

1. **A completed forward test is a calendar constraint, not an engineering one.**
   The minimum window is ~60 trading sessions (B-7) ≈ **12–14 calendar weeks**
   after the first test *starts*. Code-complete at week 22 means the first
   completed forward test lands around **week 35** — and gate **G6** (≥3 RAs
   complete a full test unprompted) cannot be reached before then, by any amount
   of engineering effort. **Start real forward tests the day W6 works.**
2. **Deferring the AI is not where the time is.** W7 is ~3–4 weeks of the ~26.
   The long poles are W5 and W6, and they are irreducible. Holding AI buys ~15%
   of the schedule and costs one of the PRD's four differentiators — worth doing
   only because W7 is *also* the workstream most exposed to blocker **B-2**
   (whether an AI critique layer makes us an RA or algo provider). **That is the
   real argument for deferring it, not speed.**

Deferring W7 is recorded as `AD-16`.

---

## 5. Architecture decisions

Each needs a date to count as decided. Recommendations are marked ⭐.

| ID | Decision | Options | Status |
|---|---|---|---|
| **AD-01** | Database | **Supabase (managed Postgres)** | ✅ **Decided 18 Aug 2026** |
| **AD-02** | Migrations / ORM | **Drizzle** — SQL-first, which is what we need for raw triggers and grants | ✅ **Decided 18 Aug 2026** |
| **AD-03** | Append-only enforcement | `BEFORE UPDATE/DELETE` triggers **+** revoked table grants. See the Supabase notes below — **RLS alone is not enough** | ✅ **Decided 18 Aug 2026** |
| **AD-04** | Auth | **Supabase Auth**, phone OTP (built in) + an SMS provider (MSG91 for India) | ✅ **Decided 18 Aug 2026** |
| **AD-05** | Engine language | ⭐ TypeScript in-repo (one language for a 2-person team) · Python service (better quant libs) | ☐ Open |
| **AD-06** | Money & prices | ⭐ Money = integer paise; prices = `NUMERIC(18,4)`. **No floats for currency, ever.** | ☐ Open |
| **AD-07** | Time | ⭐ Store UTC, display IST, market session 09:15–15:30 IST, holiday calendar required | ☐ Open |
| **AD-08** | Market data | ⭐ `MarketDataSource` interface with realtime / delayed / EOD implementations. **The engine must not know which it has.** | ☐ Open |
| **AD-09** | Scheduler | Forward tests need a durable runner. `pg_cron` (in Supabase) for the tick, but see notes — **not** Edge Functions for engine work | ☐ Open |
| **AD-10** | KYC document storage | **Supabase Storage**, private bucket, signed URLs only, access-logged | ✅ **Decided 18 Aug 2026** |
| **AD-11** | AI provider | ⭐ Claude, structured tool output (not prose), every call persisted | ☐ Open |
| **AD-12** | Test stack | **Vitest** (unit/domain) + Playwright (browser, ad hoc for now) | ✅ **Decided 19 Aug 2026** |
| **AD-13** | Hosting | **Vercel (app) + Supabase (DB/auth/storage)**; engine runner TBD with AD-09 | ✅ **Decided 18 Aug 2026** |
| **AD-14** | **Ship M6 standalone before M7?** | ⭐ Yes (see milestone note) · No | ☐ Open |
| **AD-15** | **Which onboarding flow is canonical — Investor or Alpha?** Alpha adds Google sign-in, a merged onboarding step, a join-a-group step and a market strip. Both are built and live on separate routes. | Investor · Alpha · merge | ☐ Open |
| **AD-16** | **Defer AI critique (W7)?** Buys ~15% of the schedule; the stronger reason is that W7 is the workstream most exposed to **B-2**. Build the engine first, add critique once B-2 is answered. | ⭐ Defer · Build now | ☐ Open |

### Supabase + Drizzle — things that will bite us

These follow from AD-01…AD-04 and need to be handled in W1, not discovered later.

1. **`service_role` bypasses RLS.** Our invariants cannot live in RLS policies
   alone — anything using the service key would walk straight through them.
   Append-only must be enforced by `BEFORE UPDATE/DELETE` triggers that
   `RAISE EXCEPTION` (triggers fire for every role) **plus** `REVOKE UPDATE,
   DELETE` on the application role. RLS is defence in depth, not the defence.
2. **Drizzle does not author triggers.** `drizzle-kit` generates DDL for tables
   and columns only. Every trigger, grant, and check constraint is a
   hand-written SQL migration that we own. Keep them in the same migration
   folder so they are versioned with the schema.
3. **Supabase Auth owns `auth.users`.** Our `advisors` / `investors` rows key
   off `auth.users.id` via FK. Drizzle should read that table, never migrate it.
4. **Don't run the engine in Edge Functions.** Backtests and forward-test
   evaluation are long-running and stateful; Edge Functions are short-lived and
   Deno-based. `pg_cron` is fine for *triggering* a tick, but the engine needs a
   real Node worker (AD-09).
5. **PII columns need `pgcrypto` or app-side encryption** (spec §10). Supabase
   does not encrypt columns for us — at-rest disk encryption is not the same
   thing as PAN being unreadable to anyone with DB access.
6. **Storage buckets default to awkward.** KYC documents go in a **private**
   bucket, served only through short-lived signed URLs, with every access
   logged to our own audit table (W1-10).
7. **Point-in-time recovery is a paid tier.** For a product whose entire pitch
   is an immutable performance record, backups are not optional — budget for it.
8. **`CREATE EVENT TRIGGER` requires superuser, which Supabase does not grant.**
   The soft-delete guard had to become a callable assertion run by CI rather
   than a DDL trigger that refuses the change outright. Confirmed while
   building W1-04; the column would exist until CI catches it.
9. **`schemaFilter: ["public"]` does not stop the *initial* migration emitting
   `CREATE SCHEMA "auth"`.** It was made idempotent by hand in `0000`. Later
   migrations diff against the snapshot and will not re-emit it — but check.

---

## 6. Workstreams

### W0 — Close the blockers *(not engineering — see `execution-plan.md` Tracks A/B/C)*

- [ ] **W0-01** Pull SEBI RA register, cross-reference BSE RAASB, build 40-name list
- [ ] **W0-02** Run 15 structured RA interviews, 30 min, same questions each time — **do not pitch, do not show the UI**
- [ ] **W0-03** Synthesise findings honestly, including the answers we didn't want → closes **B-5**
- [ ] **W0-04** Engage securities counsel with actual SEBI intermediary practice
- [ ] **W0-05** Get written answers to B-1, B-2, B-3, B-4
- [ ] **W0-06** Price out data vendors (TrueData, Global Datafeeds, exchange direct, broker APIs); **get redistribution terms in writing** → closes **B-6**
- [ ] **W0-07** Entity formation, ToS, advisor agreement, investor agreement, disclosure language, DPDP privacy policy
- [ ] **W0-08** Statistical justification for the minimum forward-test window → closes **B-7**
- [ ] **W0-09** Contact PaRRVA/CARE for the performance-record specification → closes **B-8**
- [ ] **W0-10** Book one week of a competent quant's time for W5/W6 review — *the cheapest insurance on this project*

### W1 — Foundation *(safe to start now)*

- [x] **W1-01** Decide AD-01…AD-04, AD-10, AD-13 — **Supabase + Drizzle, 18 Aug 2026.** AD-05…AD-09, AD-11, AD-12 still open
- [x] **W1-02** Supabase project live (ap-south-1, Postgres 17.6). **Both migrations applied 19 Aug 2026** — 15 tables, 12 enums, 9 triggers, 16 CHECKs. `npm run db:migrate` / `db:verify` / `db:inventory` wired to `scripts/*.mjs`
- [x] **W1-03** Schema per `x-wealth-product.md` §6 — 15 tables + 11 enums, in Drizzle across 9 schema modules
- [x] **W1-04** Append-only constraints written in `drizzle/0001_invariant_constraints.sql`: triggers that `RAISE EXCEPTION`, the forward-test parameter freeze, close-once paper trades, server-stamped `published_at`, 16 CHECKs, and `REVOKE UPDATE, DELETE` from `anon`/`authenticated`/**`service_role`**
- [x] **W1-05** **Verified green against the live Supabase database, 19 Aug 2026.** 21 assertions as `postgres`; then a separate `SET LOCAL ROLE service_role` phase proving all 7 append-only mutations are still rejected. Negative-controlled earlier by dropping each trigger. Also runs in CI on every push
- [x] **W1-06** `assert_no_soft_delete_columns()` — passing against the live database and wired into CI. Implemented as a callable assertion rather than a DDL event trigger because **`CREATE EVENT TRIGGER` needs superuser and Supabase's `postgres` role is not one**
- [x] **W1-07** Supabase Auth wired end to end and **verified against the live project**: `@supabase/ssr` clients, `proxy.ts` session refresh, OTP send/verify, profile creation on first sign-in, sign-out. Roles are rows in `advisors` / `investors` / `platform_admins`, **not JWT claims** — no Auth Admin API, no secret key. Phone provider is not yet enabled on the project, so `src/server/auth/dev-session.ts` accepts a fixed code (`1111`) and issues a signed cookie against a **real** `auth.users` row — three guards, one of which cannot hold in production. Delete it once SMS is configured
- [~] **W1-08** Advisor path wired and driven end to end in a browser: `/` → `/advisor/otp` → `/advisor/complete-profile` → `/advisor/kyc` → `/advisor/status` → `/ops` → verified. Sign-in destination is computed from the account's state (`src/domain/advisor-onboarding.ts`, 12 tests), and every advisor page is guarded server-side. Investor and Alpha OTP screens still navigate-only, pending AD-15 (PRD Phase 1 is advisor-only, so they are not on the critical path)
- [x] **W1-09** Registration gate as a single server-side chokepoint (`requirePublishingRights` in `src/server/identity.ts`), with the decision logic pure and tested in `src/domain/registration-gate.ts` (8 tests). **Deviation from the literal spec wording:** §5.4 says middleware, but Next 16 renamed `middleware.ts` to `proxy.ts` and documents it as a last resort that runs at a network boundary — the wrong place for a database read. One guard every protected action calls preserves the intent. Fails closed, including on a missing expiry
- [ ] **W1-10** Audit logging: actor, action, entity, before/after, timestamp
- [ ] **W1-11** PII handling — PAN, phone, DOB, documents encrypted at rest, access-logged, **never in logs, errors or analytics** (spec §10)
- [x] **W1-12** `src/domain/money.ts` — `Paise` and `PriceTicks` as distinct branded integer types, decimal parsing that never constructs a float, round-half-away-from-zero, Indian digit grouping. 23 tests including the float traps (`0.1+0.2`, `1234.565`, 10k-iteration drift) and the safe-integer ceiling
- [~] **W1-13** `src/domain/session.ts` — IST sessions, 09:15–15:30, weekend/holiday aware, session arithmetic, `isMarketOpen`. 25 tests, timezone-independent. **Remaining:** the real NSE holiday list — currently `PLACEHOLDER_CALENDAR_2026` with 3 fixed-date holidays, named "incomplete" and guarded by a test. Needs the official circular (W3-05)
- [x] **W1-14** `src/domain/symbol.ts` — exchange-qualified symbols, strict (no silent repair). 8 tests, including one that reads `drizzle/0001` and fails if the TS regex and the SQL CHECK ever drift apart
- [x] **W1-15** CI at `.github/workflows/ci.yml` — typecheck, lint, test, build; plus a second job that spins up Postgres, applies both migrations and runs `verify_invariants.sql` **twice**: once normally, once as `service_role` after deliberately re-granting the UPDATE/DELETE that `0001` revoked. Verified locally: the invariants hold with the grant layer removed, proving the triggers are the real enforcement
- [ ] **W1-16** Admin panel shell (role-gated, audit-logged)
- [ ] **W1-17** RLS policies as defence in depth on every user-facing table — never as the sole enforcement of an invariant. **Blocked on W1-21: RLS is inert until the runtime stops connecting as a role that bypasses it**
- [ ] **W1-21** **Least-privilege application role.** We currently connect at runtime as `postgres`, which owns all 56 public objects, holds `rolbypassrls`, `rolcreaterole`, `rolcreatedb`, and is a member of `service_role`. Create an `app_runtime` role with only the grants it needs, point `DATABASE_URL` at it, and keep the owner connection for migrations (`DIRECT_URL`) only. Two consequences: the blast radius of a leaked runtime credential drops enormously, and **W1-17 becomes meaningful — RLS does nothing today because the connecting role bypasses it**
- [ ] **W1-22** Decide whether `SUPABASE_SECRET_KEY` is ever needed. It is **not** required for the Drizzle data path, for roles (kept in our own tables, checked in middleware), or for the invariant checks. The only candidates are the Auth Admin API and cross-user Storage reads — both avoidable. Do not add the key speculatively
- [ ] **W1-18** Enable `pgcrypto`; encrypt PAN and document references at the column level (W1-11)
- [ ] **W1-19** Private Storage bucket for KYC documents; signed-URL-only access, every read written to the audit log
- [ ] **W1-20** Enable point-in-time recovery and verify a restore actually works — the immutable record is the product

### W2 — Advisor onboarding + KYC *(PRD §5.1 — gates everything downstream)*

- [ ] **W2-01** Capture SEBI registration no., RAASB/BSE enlistment no., PAN, firm name, MCA no.
- [ ] **W2-02** Document upload with type selector → encrypted storage (AD-10)
- [ ] **W2-03** Verification queue with **manual admin review** — *do not automate in v1; manual review at low volume teaches you the edge cases before you encode them*
- [ ] **W2-04** Registration expiry tracking + **auto-suspend on lapse**
- [ ] **W2-05** Annual re-verification prompt
- [ ] **W2-06** Publishing gate enforced at middleware, covering: strategy publication, group creation, signal issuance, fee collection
- [ ] **W2-07** Push PaRRVA opt-in **on day one, before the first forward test** — the record is prospective-only and worthless for marketing if opted in late (PRD §7)
- [ ] **W2-08** Wire `/advisor/kyc` + `/advisor/complete-profile` to the above
- [ ] **W2-09** Test: an unverified advisor is blocked from all four gated actions

### W3 — Market data layer *(interface now, implementation after B-1/B-6)*

- [ ] **W3-01** Define `MarketDataSource` — OHLCV, LTP, session state, instrument metadata
- [ ] **W3-02** Implement `EndOfDaySource` (always legal, always our floor)
- [ ] **W3-03** Implement `DelayedSource`
- [ ] **W3-04** Implement `RealtimeSource` — **blocked on B-1**
- [ ] **W3-05** Corporate action model — splits, bonuses, dividends. **Without this every backtest is silently wrong**
- [ ] **W3-06** Historical load: NSE equities daily + 1-minute, 5 years; Nifty 50 + Bank Nifty
- [ ] **W3-07** Lot sizes for derivatives; circuit-limit data for fill realism
- [ ] **W3-08** Conformance suite every implementation must pass, so the engine genuinely cannot tell them apart
- [ ] **W3-09** Record the answer to §"what data, what latency, what cost, what redistribution terms" in this file

### W4 — Strategy Builder *(PRD §5.2)*

- [ ] **W4-01** Strategy definition JSON schema — **structured data, not code** (spec §6)
- [ ] **W4-02** Indicator library with a hand-verified test per indicator
- [ ] **W4-03** Rule authoring: indicator + condition + action
- [ ] **W4-04** Instrument selection, timeframe, entry/exit, stop-loss, position sizing, capital assumption
- [ ] **W4-05** Append-only versioning with `parent_version_id` lineage
- [ ] **W4-06** **New UI** — builder screens (no artboards exist; design needed)
- [ ] **W4-07** Validation: reject a strategy that cannot be evaluated before it can be backtested

### W5 — Backtest Engine *(PRD §5.3)* ⚠️ *highest technical risk*

- [ ] **W5-01** Historical OHLCV execution simulator
- [ ] **W5-02** **Mandatory** cost model: brokerage, STT, stamp duty, exchange charges, SEBI turnover fee, GST, slippage
- [ ] **W5-03** **No `include_costs` flag. No code path that can produce a gross-return figure** (spec §5.3)
- [ ] **W5-04** No-lookahead enforcement — *a deliberate adversarial test suite, not just intent*
- [ ] **W5-05** Corporate-action adjustment applied to every series
- [ ] **W5-06** Survivorship-adjusted universe
- [ ] **W5-07** Metrics: return, max drawdown, hit rate, avg win/loss, Sharpe, trade count, exposure
- [ ] **W5-08** **Reconciliation suite: hand-calculate 20 trades and assert the engine matches to the paisa** → **G4**
- [ ] **W5-09** External quant review (W0-10)
- [ ] **W5-10** Methodology disclosure — reproducible, published with every run
- [ ] **W5-11** **New UI** — backtest results screen

> *A subtly wrong backtest produces plausible numbers that are silently false,
> and everything downstream inherits the error.* Budget for W5-08 properly.

### W6 — Forward Test Engine *(PRD §5.4 — the product)*

- [ ] **W6-01** Hypothesis declaration + parameter lock
- [ ] **W6-02** **DB-enforced freeze**: `strategy_version_id` immutable once status = `RUNNING` (spec §5.2) — trigger, not application logic
- [ ] **W6-03** Test that proves the freeze by attempting the mutation directly against the DB
- [ ] **W6-04** Scheduled evaluation against `MarketDataSource` (AD-09)
- [ ] **W6-05** Realistic fills: slippage, liquidity limits, circuit-limit handling, **no fills outside market hours**
- [ ] **W6-06** Session + holiday awareness
- [ ] **W6-07** Live equity curve and running metrics
- [ ] **W6-08** Abandonment flow — permanently recorded, **never hidden**
- [ ] **W6-09** Completion → immutable result record
- [ ] **W6-10** Configurable minimum window (default from B-7)
- [ ] **W6-11** **New UI** — forward-test console
- [ ] **W6-12** Descope to EOD + positional only if B-1 comes back negative — build against the interface either way

### W7 — AI Critique Layer *(PRD §5.5)*

- [ ] **W7-01** Read-only analysis service. **Never writes to a strategy definition** — this is a legal boundary, not a preference
- [ ] **W7-02** Structured findings, not prose verdicts. *"42 trades is below the threshold for statistical confidence at this win rate"* — **never** *"this strategy is weak"*
- [ ] **W7-03** Overfitting signals: parameter sensitivity, trade-count adequacy, indicator complexity
- [ ] **W7-04** Sample adequacy
- [ ] **W7-05** Regime dependence
- [ ] **W7-06** Liquidity feasibility at stated position size
- [ ] **W7-07** Drawdown and tail-risk characterisation
- [ ] **W7-08** Plain-language strategy explanation for investors
- [ ] **W7-09** Full logging per spec §5.7: input snapshot, model output, timestamp, `advisor_acted`, `resulting_version_id` — *this log is the evidence that the human authored the strategy*
- [ ] **W7-10** Test that no critique output path can reach a strategy write
- [ ] **W7-11** **New UI** — critique view

### W8 — Iteration Ledger + Public Profile *(PRD §5.6 — the differentiator)*

- [ ] **W8-01** Public advisor profile with the complete test history
- [ ] **W8-02** Published vs abandoned counts, prominently displayed — *"12 forward tests; 3 published, 9 abandoned"*
- [ ] **W8-03** Per strategy: every version, every test, every outcome
- [ ] **W8-04** **No filtering, no hiding, no "featured" sort** — and no API parameter that could produce one
- [ ] **W8-05** Test asserting an abandoned test is reachable from the public profile
- [ ] **W8-06** **New UI** — ledger + public profile

### W9 — PaRRVA readiness *(PRD §7)*

- [ ] **W9-01** Structure performance records to the PaRRVA specification — **blocked on B-8**
- [ ] **W9-02** Advisor opt-in flow and status surfacing
- [ ] **W9-03** Verification link/QR on every claim
- [ ] **W9-04** Export
- [ ] **W9-05** Keep the results payload flexible until the schema is confirmed (spec §9.3)

### W10 — Invariant remediation *(existing code violates the spec today)*

- [ ] **W10-01** Remove `RatingRing` 0–5 index score. Spec §8 bans star ratings, quality badges and platform verdicts; PRD §6 bans platform performance claims. Used in `GroupCard.tsx:121`, both group profile pages, and `alpha/DiscoverListCard.tsx`
- [ ] **W10-02** Strip hardcoded return figures from fixtures — `aum: "345%"`, `accuracy: "94%"`, `rating: 4.9` (`lib/groups.ts:46-51`), `Revenue ₹230K` (`lib/advisor.ts`), `aum/accuracy` (`lib/subscription.ts`). Spec §8 forbids these **including in seed data and demo content**; use obviously-fake placeholders
- [ ] **W10-03** Remove the real-format SEBI number `INP000005847` from `lib/subscription.ts`
- [ ] **W10-04** Cut free-form group chat (PRD §5.8, spec §8) — `/groups/[id]/thread`, `/alpha/groups/[id]`, `/alpha/groups/[id]/tinted`, `Composer.tsx`. **Announcements only.** Largest screen count in the file and an unmonitored channel where an RA can say anything
- [ ] **W10-05** Fix the "Acuracy" typo (3 sites) — moot if W10-01/02 remove the metric
- [ ] **W10-06** Fix the `CLAUDE.md` §-reference pointers in `execution-plan.md` (9 references point at the wrong file)
- [ ] **W10-07** Resolve the PRD §12 vs G3 contradiction on blocker 2
- [ ] **W10-08** Replace group "discovery" with **strategy** discovery (PRD §5.10) — sortable on recorded metrics only, each card showing forward-test record, drawdown, iteration count and abandonment history
- [ ] **W10-09** Ban list as a lint rule or test: no "verified", "top-rated", "high-performing", "best" copy anywhere in the product (spec §5.6)
- [ ] **W10-10** Replace the Alpha empty-state stand-in illustration and the `/alpha/google` placeholder with real assets / the OAuth redirect
- [ ] **W10-11** Add the Send Signal → Preview state (Figma `Group 1797`: Add a Chart + rendered card preview) — the only artboard not yet built

### W11 — Investor side *(Phase 2)*

- [ ] **W11-01** Wire investor onboarding to real auth (screens exist)
- [ ] **W11-02** **Mandatory risk-disclosure acknowledgement** + suitability capture (PRD §5.9)
- [ ] **W11-03** Strategy discovery backed by real records (see W10-08)
- [ ] **W11-04** Sorting on recorded metrics only — **never platform scoring**
- [ ] **W11-05** Disclosure at point of decision — on the signal itself, not a footer (PRD §6)

### W12 — Groups, signals & advisor dashboard *(Phase 2)*

- [ ] **W12-01** Groups: create, tiers, join, member management, invite links, referral handle
- [ ] **W12-02** Every group displays its linked strategy's **full** record (PRD §5.8)
- [ ] **W12-03** Signal composer bound to a **completed forward-test record** — mandatory (PRD §5.7)
- [ ] **W12-04** Auto-populated disclosure block on every signal
- [ ] **W12-05** Immutable signals: server-generated `published_at`, no edit, no delete, no backdating; amendments are new records via `amends_signal_id` (spec §5.5)
- [ ] **W12-06** Announcement delivery (no free-form chat)
- [ ] **W12-07** Advisor dashboard extensions: live strategy performance, subscriber follow-through rate, disclosure compliance status

### W13 — Portfolio, attribution & payments *(Phase 2)*

- [ ] **W13-01** Manual portfolio entry: ticker, qty, avg price, transaction date
- [ ] **W13-02** Holdings, LTP, P&L, CAGR, watchlist
- [ ] **W13-03** **Signal attribution** via `source_signal_id` — did the investor take the trade, at what price. *The single most valuable dataset the platform will generate — do not drop it*
- [ ] **W13-04** Live vs paper performance delta, derived from W13-03
- [ ] **W13-05** Billing built so **both** revenue share and flat SaaS are possible (spec §9.4) — **blocked on B-3**
- [ ] **W13-06** Checkout, taxes, confirmation, management
- [ ] **W13-07** Assess CeFCoM exposure — SEBI's centralized fee mechanism lets investors pay RAs directly, routing around any commission (PRD §9.2)

### W14 — Beta & operations

- [ ] **W14-01** Closed beta: 10 advisors, 100 investors, invite only
- [ ] **W14-02** Instrument the guardrail metrics (§7 below)
- [ ] **W14-03** Complaint intake and per-advisor tracking
- [ ] **W14-04** Quarterly legal review retainer (regulation changes mid-build)
- [ ] **W14-05** Curate the early advisor cohort by hand — mitigates adverse selection, where the worst RAs adopt first
- [ ] **W14-06** Iterate on real usage before opening up

---

## 7. Metrics to instrument *(PRD §10)*

**Primary:** verified advisors onboarded · forward tests **completed** (not
started) · strategies published · paying investors · advisor retention at 6 months

**Guardrail — these are the ones that matter:**

- [ ] **MET-01** Published-to-abandoned ratio — *if it approaches 1:0, our standards are theatre* (**G7** fails above 3:1)
- [ ] **MET-02** Median forward-test duration — *gaming shows up as short windows*
- [ ] **MET-03** Live vs paper performance delta per strategy
- [ ] **MET-04** Subscriber outcome **distribution** — not average
- [ ] **MET-05** Complaint rate per advisor

**Do not optimise for:** signals sent per day · group message volume ·
strategies published. *Every one of these goes up when quality goes down.*

---

## 8. Do NOT build *(spec §8 — refuse these when they get suggested)*

- Order execution or broker order placement — makes us a regulated algo provider
- Any wallet, fund custody, or money-holding feature
- Leverage, margin, or derivatives simulation beyond basic F&O paper trades
- Strategy scoring, star ratings, quality badges, "verified" marks
- Auto-applying AI suggestions to a strategy definition
- Delete or hide functionality on any performance record
- Free-form group chat — announcements only in v1
- Leaderboards ranked by returns — ranking by return is a performance claim
- Copy-trading with automatic execution
- Anything involving crypto
- Hardcoded return figures anywhere, **including seed data and demo content**

---

## 9. Standing risks *(from `execution-plan.md`)*

| Risk | Impact | Mitigation | Tracked by |
|---|---|---|---|
| Real-time data legally unavailable | High | Data abstraction layer, EOD fallback | W3, B-1 |
| Classified as RA / algo provider | **Fatal** | Legal opinion before launch; AI stays read-only | B-2, W7-01 |
| RAs won't publish failures | **Fatal** | Tested in interviews, week 3 | B-5, W0-02 |
| Backtest engine subtly wrong | **Fatal (reputational)** | Hand-calculation reconciliation + external quant | W5-08, W5-09 |
| Zerodha ships this inside Kite | High | Watch continuously; speed is the only defence | — |
| Advisors bypass fees via CeFCoM | Medium | Flat SaaS model removes exposure entirely | W13-07, B-3 |
| Regulation changes mid-build | Medium | Quarterly legal review retainer | W14-04 |
| Adverse selection — worst RAs adopt first | Medium | Manual verification; hand-curated early cohort | W2-03, W14-05 |

---

## 10. The honest read

We have built the two easiest parts of the system. The hard part — the
forward-test engine — is unstarted and blocked on an unresolved legal question,
and the core assumption (that registered RAs want this) is untested.

That is a normal place to be and it is recoverable. But the next four weeks
should go almost entirely to **W0**, not to building. Fifteen phone calls and
one legal opinion will tell us more about whether this business exists than
three months of engineering will.

**The UI isn't wasted. It just isn't the thing that determines whether we have
a company.**

---

## Changelog

| Date | Change |
|---|---|
| 18 Aug 2026 | File created. Current state audited: 53 screens built (Investor 18, Advisor 26, Alpha 16), zero backend. All workstreams W0–W14 defined, blockers B-1…B-8 and decisions AD-01…AD-15 opened. |
| 18 Aug 2026 | **Stack decided: Supabase (Postgres, Auth, Storage) + Drizzle ORM, deployed on Vercel.** AD-01/02/03/04/10/13 closed. Added the Supabase gotchas list, W1-17…W1-20, and a timeline estimate for the advisor product with AI critique deferred (`AD-16`). |
| 19 Aug 2026 | **W4 strategy authoring live (PRD §5.2).** `src/domain/strategy.ts` — structured definition, validator that rejects unevaluatable strategies (18 tests). `createStrategy` / `reviseStrategy` behind the registration gate; **a revision is a new row, never an update**, confirmed against the live database: v1 → v2 with correct parent lineage, and a direct `UPDATE` still rejected by the trigger. Screens: `/advisor/home`, `/advisor/strategies/new`, `/advisor/strategies/[id]` (the iteration ledger in its first form — no filter, no sort, nothing hideable). Unified the two competing `StrategyDefinition` types onto the domain one. 104 tests. |
| 19 Aug 2026 | **Fixed: database connection starvation.** `db()` opened a pool with `max: 1` cached in module scope; Next's dev HMR re-evaluates modules, so every reload leaked a pool and pages degraded to 25–30s. Pool is now cached on `globalThis` with `max: 10` and timeouts. Sign-in 25s → 0.31s, advisor home 30s → 0.25s. Would have bitten production too. |
| 19 Aug 2026 | **Fixed: a verified advisor was re-asked for every detail on sign-in.** The OTP screen pushed a hardcoded `nextHref`, so sign-in and sign-up went to the same place. Destination is now computed from the record (`nextAdvisorStep`), and — found while fixing it — `/advisor/complete-profile` and `/advisor/kyc` were rendering for signed-out visitors (200, not 307). Both are server-guarded now, KYC refuses deep-links mid-review, and the profile form prefills. 86 tests. |
| 19 Aug 2026 | **Advisor signup → verification works end to end on the live database.** Signed up via the real screens with OTP `1111`, saved profile, submitted KYC, granted ops access with `npm run grant-admin`, approved, and watched the registration gate open. Confirmed in Postgres: advisor `VERIFIED` with `verified_at` and expiry, document row, audit entry carrying no PII. Two defects found and fixed on the way: a nested `<button>` in `UploadField` (invalid HTML, hydration failure) and a bypass condition keyed off a provider error that verification never returns. `/ops` is gated on `platform_admins`; W1-16 admin shell partly satisfied. |
| 19 Aug 2026 | **PRD §4 revised flow started (advisor-first).** Migration `0002`: advisors can now exist pre-KYC (`sebi_registration_no` nullable + partial unique index) with CHECKs requiring the number before leaving `UNSUBMITTED` and a timestamp on `VERIFIED`; added `platform_admins` for the ops role. Supabase Auth wired (W1-07), registration gate done (W1-09). New domain primitives: `registration-gate.ts`, `phone.ts`. 74 tests green. **Next 16 note:** `middleware.ts` is deprecated in favour of `proxy.ts`. |
| 19 Aug 2026 | **Migrations applied to the live database and the invariants verified on it (W1-02, W1-05, W1-06 done).** 15 tables, 12 enums, 9 triggers, 16 CHECKs. Append-only proven to hold under `service_role`. Three real defects found and fixed in the process: `CREATE TABLE IF NOT EXISTS auth.users` fails on Supabase permissions (removed from `0000`; CI now provides it); `drizzle-kit migrate` exits 0 having done nothing when the `pg` driver is missing (replaced with `scripts/db-migrate.mjs`); `DIRECT_URL` was on the transaction pooler. |
| 19 Aug 2026 | **Supabase project created (ap-south-1, Mumbai); `.env.local` staged.** AD-12 closed: Vitest. **W1-12, W1-14, W1-15 done; W1-13 in progress.** 56 tests green. `drizzle.config.ts` now loads `.env.local` explicitly — drizzle-kit is a standalone CLI and would otherwise see an undefined `DIRECT_URL`. **Blocked on the DB password and `DIRECT_URL` before migrations can run.** Also corrected: Supabase Auth has no native MSG91 provider (AD-04). |
| 18 Aug 2026 | **Schema and invariant constraints written (W1-03, W1-04).** 15 tables, 11 enums, 9 triggers, 16 CHECKs across `drizzle/0000` + `drizzle/0001`. `verify_invariants.sql` proves all 21 invariants and is negative-controlled. Nothing wired — no Supabase project, no credentials, no app code imports `src/db`. Two new gotchas found and recorded (event triggers need superuser; `schemaFilter` leaks `auth` on the first migration). |
