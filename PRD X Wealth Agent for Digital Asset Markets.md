# **PRD — X-Wealth (working title)**

## **1\. Problem**

Two sides, one broken market.

**Investors** buying trading signals in India have no way to tell a good advisor from a lucky one. Track records are self-reported, cherry-picked, and usually screenshots. The Avadhut Sathe order (₹546 cr disgorgement, Dec 2025\) is what the bottom of this market looks like.

**Registered RAs** have the opposite problem: they're legitimate, but they compete against unregistered operators who can claim anything. And since PaRRVA went live on 4 May 2026, every performance claim they make now needs standardized, independently verifiable data — with no tooling in the market to produce it.

## **2\. Goals / Non-goals**

**Goals**

* Give registered RAs a rigorous forward-testing environment before they publish a strategy  
* Produce performance records structured for independent verification  
* Give investors honest, complete disclosure — including what *didn't* work  
* Build a distribution and monetization layer RAs actually want

**Non-goals**

* Being the verification authority *(PaRRVA is)*  
* Generating investment advice ourselves  
* Order execution *(not in v1, possibly never)*  
* Holding client funds *(never)*

## **3\. Users**

|  | Who | Core job |
| ----- | ----- | ----- |
| **Advisor** | SEBI-registered RA (individual or firm) | Prove a strategy works, then distribute and monetize it |
| **Investor** | Retail, ₹50k–₹10L, some market literacy | Find a signal provider who isn't lying |
| **Platform ops** | Us | Verify registrations, police disclosure, run the rails |

## **4\. Core loop — revised**

Your version, then mine.

**Your flow:** build → backtest → AI paper-trades → **AI recommends changes → retry until threshold** → publish with badge → investors subscribe.

**\[CHANGED\] Revised flow:** build → backtest → declare hypothesis and lock parameters → forward paper-trade for a fixed minimum window → AI produces a critique (not modifications) → advisor decides to publish, revise, or abandon → **every iteration is logged and publicly visible** → publish with full record, not a badge → investors subscribe.

Three things changed and here's why:

**No AI-authored strategy modification.** The moment your model reshapes the strategy, you co-author the recommendation and "our advisors are registered" stops protecting you. The AI critiques; the human decides. Keeps authorship clean.

**No pass/fail threshold badge.** A threshold you set is a performance claim by an unappointed authority, and PaRRVA explicitly forbids showing only the good parts. Replace with: publish the complete record and let investors judge.

**Fixed test window, declared up front.** Kills the retry loop. If you can iterate until something passes, you're p-hacking — run enough variants and some clear any bar on noise alone. Lock parameters before the window starts, run to completion, publish the result whatever it is.

## **5\. Modules & design reuse**

### **5.1 Advisor onboarding \+ KYC — reuse X-Wealth as-is**

SEBI registration number, PAN, firm name, MCA number, document upload, document type selector. Add: RAASB/BSE enlistment number, validity check against the SEBI/BSE register, annual re-verification, and a hard block on any publishing action until verified.

*This is the single most reusable thing in your design file.*

### **5.2 Strategy Builder — new**

Rule-based authoring (indicator \+ condition \+ action). Instruments, timeframe, entry/exit logic, stop-loss, position sizing, capital assumption. No-code first; script mode later. Reference points: Streak, AlgoTest.

### **5.3 Backtest Engine — new**

Historical run with mandatory cost modelling: brokerage, STT, stamp duty, exchange fees, GST, slippage assumption. **Hard requirement:** no lookahead bias, survivorship-adjusted universe, methodology disclosed and reproducible.

### **5.4 Forward Test Console — new, and the product's core**

Advisor declares the hypothesis and locks parameters. Minimum window (suggest 60–90 sessions, needs validation). Runs on market data — see §8, this is the binary. Live equity curve, trade log, drawdown, hit rate, average win/loss, exposure. **Parameters are immutable during the window.** Abandoning is allowed and permanently recorded.

### **5.5 AI Critique Layer — new \[CHANGED\]**

The AI's job is to find problems, not to fix them:

* Overfitting signals — parameter sensitivity, too few trades, curve-fit indicators  
* Sample adequacy — is 40 trades enough to say anything?  
* Regime dependence — does this only work in trending markets?  
* Liquidity feasibility — can this size actually fill?  
* Drawdown and tail risk characterization  
* Plain-language strategy explanation for investors

Output is advisory to the human, logged, and never auto-applied.

### **5.6 Iteration Ledger — new \[CHANGED\]**

Every version, every abandoned test, every failed window — permanently visible on the advisor's public profile. "This advisor has run 12 forward tests; 3 are published, 9 were abandoned."

This is your actual differentiator. Everyone shows winners. Nobody shows the denominator.

### **5.7 Signal Composer — reuse X-Wealth, extend**

Existing fields are right: entry, exit, stop-loss, start/end date, timeframe, risk profile, duration, rationale note, chart attachment, tags.

Add: mandatory binding to a completed forward-test record, auto-populated disclosure block, immutable timestamp on publish, no post-hoc editing.

### **5.8 Groups & Distribution — reuse X-Wealth**

Create group, public/private, segment, experience level, description, pricing tiers, member management, invite links, referral handle. Extend: every group must display the linked strategy's full record.

**\[CHANGED\] Cut for v1:** free-form group chat. It's the largest screen count in the design file and it's an unmonitored channel where an RA can say anything — a compliance liability with no v1 revenue attached. Announcements only.

### **5.9 Investor Onboarding — reuse X-Wealth**

OTP, profile, experience segmentation (Beginner → Super Pro), interest picker. Add: mandatory risk disclosure acknowledgement, suitability capture.

### **5.10 Strategy Discovery — new**

Browse published strategies. Sortable on verified metrics only. Every card shows the forward-test record, the drawdown, the iteration count, and the advisor's abandonment history.

### **5.11 Portfolio — reuse X-Wealth**

Manual entry (ticker, qty, avg price, transaction date), holdings, LTP, P\&L, CAGR, watchlist. Add: signal-attribution — did the investor actually take the trade, and at what price.

*Attribution matters more than it looks: it's the only way to show real-world outcome versus paper outcome.*

### **5.12 Advisor Dashboard — reuse X-Wealth, extend**

Existing: members, paid users, revenue, drafts, views. Add: live strategy performance, subscriber follow-through rate, disclosure compliance status.

### **5.13 Subscription & Payments — reuse X-Wealth, revisit**

Tiers, checkout, taxes, confirmation, management. See §9 — this needs a decision, not just screens.

## **6\. Hard requirements**

* **Parameter immutability** during a forward-test window. Enforced technically, not by policy.  
* **Complete disclosure.** No published strategy without its full iteration history, worst drawdown, and abandonment record. No exceptions, no premium tier that hides it.  
* **Registration gate.** No publishing, no group creation, no fee collection without verified live SEBI registration. Auto-suspend on lapse.  
* **Cost-inclusive results.** Every performance figure net of brokerage, STT, stamp duty, GST, exchange fees, and a stated slippage assumption. Gross returns are never displayed.  
* **Immutable signal records.** Published signals cannot be edited or deleted. Amendments are new records.  
* **No platform-authored strategy content.** AI critiques; humans author. Every AI interaction logged with input, output, and whether the advisor acted on it. *This log is your defence if SEBI ever asks who wrote the strategy.*  
* **Disclosure at point of decision.** Risk and non-advice language on the signal itself, not in a footer. Contemporaneous, not buried.  
* **No performance claims by the platform.** We report what happened. We never grade it.

## **7\. Compliance architecture**

**Our position:** technology and infrastructure provider to SEBI-registered intermediaries. We do not produce research, do not advise, do not execute, do not custody.

**PaRRVA integration** *(design once mechanics are confirmed):* structure all performance data to PaRRVA's specification, support advisor opt-in, surface the verification link/QR on every claim. Note the prospective-only rule — verification runs from opt-in date forward, so **advisors should be pushed to opt in on day one**, before their first forward test, or the record is worthless for marketing.

**Algo framework exposure:** if we ever touch execution, we become an algo provider — exchange empanelment, broker partnership, principal-agent structure, per-algo approval. This is the strongest argument for keeping v1 signals-only.

**Not doing:** discretionary management, execution, fund custody, performance grading, guaranteed returns.

## **8\. Data strategy — the binary**

The forward-test engine's data supply is unresolved and it determines whether the product exists in its current form.

**Track A — real-time.** Requires written legal comfort that a professional research tool serving registered intermediaries falls outside the May 2024 restriction as revised July 2026\. If yes: build as specced.

**Track B — delayed / end-of-day.** If real-time is unavailable, forward tests run on EOD data. This restricts you to swing and positional strategies and eliminates intraday entirely. **Not fatal** — positional strategies are arguably the healthier product anyway, and the intraday signal market is where most retail money dies.

**Decide Track A vs B before any engineering.** The architecture differs materially and you cannot retrofit.

## **9\. Monetization**

Advisor subscription revenue, platform takes a percentage.

**Two unresolved problems, both need answers before build:**

1. **Can an unregistered platform take a revenue share from an RA's fee income?** Lawyer question. If the answer is no, the model becomes SaaS — advisors pay a flat platform fee, investors pay advisors directly. Less upside, still viable.  
2. **CeFCoM leakage.** SEBI's centralized fee mechanism has run since Oct 2024 and lets investors pay RAs directly through UPI/netbanking/NACH. It's optional — but it's SEBI-endorsed and signals legitimacy. Every advisor who uses it routes around your commission. Your revenue depends on advisors choosing *not* to use the regulator's preferred rail. That's a weak position.

**Fallback that removes both problems:** flat SaaS subscription from advisors for the tooling. You're selling forward-testing and PaRRVA-readiness, not taking a cut of advice. Cleaner legally, more predictable revenue, no CeFCoM exposure.

## **10\. Metrics**

**Primary:** verified advisors onboarded · forward tests *completed* (not started) · strategies published · paying investors · advisor retention at 6 months

**Guardrail — these are the ones that matter:**

* Published-to-abandoned ratio *(if it approaches 1:0, your standards are theatre)*  
* Median forward-test duration *(gaming shows up as short windows)*  
* Live vs paper performance delta per strategy  
* Subscriber outcome distribution — **not average**, distribution  
* Complaint rate per advisor

**Do not optimize for:** signals sent per day, group message volume, strategies published. Every one of these goes up when quality goes down.

## **11\. Phasing**

**Phase 0 — Legal gate (4–6 weeks, before any build).** Three answers required: real-time data legality, whether AI critique makes us an RA/algo provider, whether revenue share is permitted. Plus: talk to 5–10 registered RAs. If they won't use it, nothing downstream matters.

**Phase 1 — Advisor tooling only.** KYC, strategy builder, backtest, forward test, AI critique, iteration ledger, PaRRVA-ready export. No investors, no groups, no money. Sell as SaaS. This is a complete product on its own and proves the hardest part works.

**Phase 2 — Distribution.** Investor onboarding, discovery, groups, signal delivery, subscription, portfolio.

**Phase 3 — Scale.** Advisor tiering, richer analytics, mobile parity, attribution.

**Phase 4 — Execution.** Only if 1–3 work, and only via broker partnership with full algo-framework compliance. Assume this is 18+ months out.

## **12\. Open blockers**

1. Real-time data legality — **blocks Phase 1**  
2. Does AI critique make us an RA or algo provider — **no**   
3. Revenue share permissibility — **blocks Phase 2**  
4. Will registered RAs actually adopt this — **blocks everything**

## **13\. Out of scope**

Execution · custody · leverage · unregistered advisors · guaranteed returns · discretionary management · crypto · copy-trading with auto-execution

---

