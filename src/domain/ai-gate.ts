/**
 * The no-verdict gate, shared by every AI context that renders. `CLAUDE.md`
 * §7.11 and §8.7.
 *
 * One vocabulary, one key list, however many contexts. The post-mortem and the
 * critique must refuse the same words, or the model's grading migrates to
 * whichever surface forgot one — and the list would drift the first time it
 * was copied.
 *
 * These run at *runtime*, on every output, stored ones included. The
 * adversarial suite holds the same line in its tests (W18-10) because its
 * producer is our own deterministic code; here the producer is a model, and a
 * test cannot see what it will say tomorrow.
 */

export type GateIssue = { readonly path: string; readonly message: string };

/**
 * Words that turn an observation into a grade. Tight on purpose: a list that
 * flags honest description ("the close was higher") gets bypassed within a
 * week, which is the same argument the lint rule's `allow` list makes.
 */
export const JUDGEMENT =
  /\b(weak|strong|bad|good|poor|excellent|promising|solid|impressive|terrible)\b/i;

/**
 * Key names that must not exist anywhere in an output, whatever their value.
 * Schemas already refuse them via `additionalProperties: false`; this is the
 * second lock, so a schema edit cannot quietly open the door §8.7 closes.
 */
export const BANNED_OUTPUT_KEYS = [
  "score",
  "grade",
  "rating",
  "rank",
  "stars",
  "verdict",
  "quality",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every grading key in the object, wherever it hides. Empty means clean. */
export function bannedKeyIssues(output: unknown, root = "$"): GateIssue[] {
  const issues: GateIssue[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!isRecord(value)) return;
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (BANNED_OUTPUT_KEYS.some((b) => lower.includes(b))) {
        issues.push({
          path: `${path}.${k}`,
          message: "a grading field is not a shape this record can hold (§8.7)",
        });
      }
      walk(v, `${path}.${k}`);
    }
  };
  walk(output, root);
  return issues;
}
