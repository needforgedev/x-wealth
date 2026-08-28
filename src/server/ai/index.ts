/**
 * The AI layer's public surface.
 *
 * Application code imports from here and gets exactly one way to reach a model:
 * `runInteraction`, which does not return until the call is recorded. The
 * provider interface and its implementations are deliberately **not**
 * re-exported — a caller holding a provider could call `complete` directly and
 * show output that never reached `ai_interactions`, which is the one thing
 * `plan.md` W15-03 exists to prevent.
 *
 * Nothing stops someone importing `./provider` by path. What this does is make
 * the bypass a visible, greppable act rather than the shortest route, and
 * `index.test.ts` fails if the barrel ever starts offering it.
 *
 * The types are exported because callers need to describe what they are asking
 * for. Types cannot call anything.
 */

export {
  AiLogError,
  interactionLog,
  recordUserActed,
  runInteraction,
  type Executor,
  type InteractionLog,
  type LoggedInteraction,
  type NewInteraction,
} from "./interaction";

export { AiProviderError, type AiCall, type AiProviderMetadata, type AiResponse } from "./provider";
