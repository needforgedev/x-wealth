/**
 * W15-04…07 — does the workbench sharpen against a real model?
 *
 *   npm run verify-hypothesis
 *
 * Unit tests prove the gate refuses what it must refuse. This asks what they
 * cannot: given the sentences a trader actually types, does the live model
 * return a statement, its negation and a runnable horizon that survive
 * `validateHypothesis` — and does a vague idea come back as questions rather
 * than an invented hypothesis?
 *
 * In memory, like `verify-compile`: local log, no database. The workbench has
 * no data to touch by design, so there is nothing to roll back.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { HYPOTHESIS_PROMPT_VERSION, buildHypothesisInput, validateHypothesis } =
  await import("@/domain/hypothesis");
const { runInteraction } = await import("@/server/ai/interaction");

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set in .env.local, so this would test the stub.\n" +
      "The gate only means something against answers nobody scripted.",
  );
  process.exit(1);
}

/** In memory. The point here is the model and the gate, not the log. */
const log = {
  async record() {
    return { id: "00000000-0000-0000-0000-000000000000", createdAt: new Date() };
  },
  async markActed() {
    return true;
  },
};

const CASES: Array<{ idea: string; expect: "SHARPENED" | "NEEDS_INPUT" }> = [
  {
    idea:
      "Large caps that drop more than 5% in a week without company news tend to bounce back " +
      "within a couple of weeks. I want to buy those dips instead of waiting for confirmation.",
    expect: "SHARPENED",
  },
  {
    // Too vague to negate. The honest answer is questions, not an invented
    // hypothesis — the workbench equivalent of the compiler's NEEDS_INPUT.
    idea: "I feel like momentum works in Indian markets.",
    expect: "NEEDS_INPUT",
  },
];

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

for (const [i, testCase] of CASES.entries()) {
  console.log(`\n[${i + 1}/${CASES.length}] "${testCase.idea.slice(0, 60)}…"`);

  const logged = await runInteraction({
    userId: "00000000-0000-0000-0000-000000000000",
    contextType: "HYPOTHESIS",
    promptVersion: HYPOTHESIS_PROMPT_VERSION,
    input: buildHypothesisInput({ idea: testCase.idea }),
    log,
  });
  console.log(`  model: ${logged.modelId}`);

  const gated = validateHypothesis(logged.output);
  check(gated.status === "VALID", "the live answer passes the gate");
  if (gated.status !== "VALID") {
    for (const issue of gated.issues) console.log(`         ${issue.path}: ${issue.message}`);
    continue;
  }

  check(
    gated.view.status === testCase.expect,
    `answered as ${testCase.expect}`,
    `got ${gated.view.status}`,
  );

  if (gated.view.status === "SHARPENED") {
    const { hypothesis, challenges, priorArt } = gated.view;
    console.log(`\n  hypothesis · needs ~${hypothesis.horizonSessions} sessions`);
    console.log(`  ${hypothesis.statement}`);
    console.log(`  wrong if: ${hypothesis.wouldBeWrongIf}\n`);
    for (const c of challenges) console.log(`  challenge: ${c}`);
    for (const p of priorArt) console.log(`  prior art: ${p}`);
  } else {
    for (const q of gated.view.questions) console.log(`  asks: ${q.question}`);
  }
}

console.log(
  `\n${failures === 0 ? "✓ the workbench sharpens what was said, asks when it cannot, and touches no data" : `✗ ${failures} check(s) failed`}`,
);
process.exit(failures === 0 ? 0 : 1);
