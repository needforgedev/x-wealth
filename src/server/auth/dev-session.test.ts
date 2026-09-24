import { afterEach, describe, expect, it, vi } from "vitest";

type Case = [string, string | undefined, string | undefined, string | undefined, boolean, string];

const CASES: Case[] = [
  ["development", "true", "s", undefined, true, "local: unchanged"],
  ["production", "true", "s", undefined, false, "prod without override: still shut"],
  ["production", "true", "s", "true", true, "prod with override: open"],
  ["production", undefined, "s", "true", false, "override alone is not enough"],
  ["production", "true", undefined, "true", false, "no secret: shut"],
  ["production", "true", "s", "1", false, "override must be exactly 'true'"],
];

describe("isDevAuthEnabled", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  for (const [nodeEnv, bypass, secret, override, expected, label] of CASES) {
    it(label, async () => {
      vi.resetModules();
      const env = process.env as Record<string, string | undefined>;
      env.NODE_ENV = nodeEnv;
      const pairs: [string, string | undefined][] = [
        ["DEV_AUTH_BYPASS", bypass],
        ["DEV_AUTH_SECRET", secret],
        ["DEV_AUTH_ALLOW_IN_PRODUCTION", override],
      ];
      for (const [k, v] of pairs) {
        if (v === undefined) delete env[k];
        else env[k] = v;
      }
      const { isDevAuthEnabled } = await import("./dev-session");
      expect(isDevAuthEnabled()).toBe(expected);
    });
  }
});
