/**
 * W4-12 — does the compiler actually compile? Against a real model.
 *
 *   npm run verify-compile
 *
 * Unit tests prove the normaliser behaves on drafts we wrote ourselves. That is
 * the easy half. This asks the question they cannot: **given a sentence a
 * trader would actually type, does the model return something that survives
 * `validateStrategyDefinition`?** A schema the model cannot satisfy passes
 * every unit test and is worthless.
 *
 * Deliberately does **not** touch the database. It calls the provider directly
 * with an in-memory interaction log, so the model, the schema, the retry path
 * and the normaliser are all exercised while Supabase is unreachable. What it
 * therefore does not prove is the logging spine — that is `interaction.test.ts`
 * and `db:verify`, which already do.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { buildCompileInput, compileDefinition, COMPILE_PROMPT_VERSION } = await import("@/domain/compile");
const { resolveProvider } = await import("@/server/ai/registry");
const { runInteraction } = await import("@/server/ai/interaction");

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set in .env.local, so this would test the stub.\n" +
      "Get a key at https://openrouter.ai/keys — the default model is free.",
  );
  process.exit(1);
}

const CATALOGUE = [
  { symbol: "NSE:RELIANCE", name: "Reliance Industries", tradeable: true, barCount: 900 },
  { symbol: "NSE:TCS", name: "Tata Consultancy Services", tradeable: true, barCount: 900 },
  { symbol: "NSE:HDFCBANK", name: "HDFC Bank", tradeable: true, barCount: 900 },
  { symbol: "NSE:INFY", name: "Infosys", tradeable: true, barCount: 900 },
  { symbol: "NSE:NIFTY50", name: "Nifty 50", tradeable: false, barCount: 900 },
];

/** Things a trader types. The last two are incomplete on purpose. */
const IDEAS: Array<{ idea: string; expect: "COMPILED" | "NEEDS_INPUT" }> = [
  {
    idea: "Buy Reliance when the 14-day RSI drops below 30, sell when it goes back above 60. " +
      "5% stop loss, risk 1% of capital per trade, take profit at 20%.",
    expect: "COMPILED",
  },
  {
    idea: "On TCS and Infosys, go long when the 20-day moving average crosses above the 50-day. " +
      "Exit on the reverse cross. Stop 4% below entry, risk 2% per trade.",
    expect: "COMPILED",
  },
  { idea: "Buy HDFC Bank when it looks oversold.", expect: "NEEDS_INPUT" },
  { idea: "I want to trade the Nifty when momentum turns up.", expect: "NEEDS_INPUT" },
];

/** In memory. The point here is the model, not the log — see the header. */
const log = {
  async record() {
    return { id: "verify-compile", createdAt: new Date() };
  },
  async markActed() {
    return true;
  },
};

const provider = resolveProvider();
console.log(`\ncompiling against ${provider.metadata.name}\n`);

let failures = 0;
for (const { idea, expect } of IDEAS) {
  const short = idea.length > 68 ? `${idea.slice(0, 65)}...` : idea;
  try {
    const logged = await runInteraction({
      userId: "verify",
      contextType: "COMPILE",
      promptVersion: COMPILE_PROMPT_VERSION,
      input: buildCompileInput({ idea, catalogue: CATALOGUE, defaultCapitalPaise: 10_000_000 }),
      provider,
      log,
    });

    const result = compileDefinition(logged.output as never, CATALOGUE);
    const ok = result.status === expect;
    if (!ok) failures++;

    console.log(`  ${ok ? "PASS" : "FAIL"}  ${short}`);
    console.log(`        expected ${expect}, got ${result.status}`);

    if (result.status === "COMPILED") {
      const d = result.definition;
      console.log(`        ${d.universe.instruments.join(", ")} · stop ${d.stopLossPercent}% · ` +
        `target ${d.targetPercent ?? "none"} · ${d.sizing.kind}`);
      if (result.assumptions.length > 0) {
        console.log(`        assumed: ${result.assumptions.join(" | ")}`);
      }
    } else if (result.status === "NEEDS_INPUT") {
      for (const q of result.questions) console.log(`        asks: ${q.question}`);
    } else {
      console.log(`        rejected: ${result.issues.map((i) => `${i.field} — ${i.message}`).join("; ")}`);
    }
  } catch (error) {
    failures++;
    console.log(`  FAIL  ${short}`);
    console.log(`        ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log("");
}

console.log(
  failures === 0
    ? "✓ every idea compiled or asked for what it was missing"
    : `✗ ${failures} of ${IDEAS.length} did not behave as expected`,
);
process.exit(failures === 0 ? 0 : 1);
