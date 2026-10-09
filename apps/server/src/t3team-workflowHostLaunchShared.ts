/**
 * What the `launchThread` host verbs share (t3team-workflowHostLaunch.ts): answers, the reason
 * behind a refused command, the author of a recipe's messages and the host's reserved fact keys.
 */
import * as Effect from "effect/Effect";

export const refuse = (error: string) => Effect.succeed({ ok: false as const, error });
export const answer = <T>(value: T) => ({ ok: true as const, value });

/** A refused command's reason, from the innermost cause that states one. */
export function refusalOf(error: unknown): string {
  let reason = "";
  for (let current: unknown = error; current != null;) {
    if (typeof current === "string") return current;
    const { message, cause } = current as { message?: unknown; cause?: unknown };
    if (typeof message === "string" && message.length > 0) reason = message;
    current = cause;
  }
  return reason || String(error);
}

export const authorOf = (runId: string) => ({ kind: "system", workflowRunId: runId }) as const;

/** The first `t3team.*` key: those facts are the host's to write. */
export const reservedFactKey = (extensions: Readonly<Record<string, unknown>>) =>
  Object.keys(extensions).find((key) => key.startsWith("t3team."));

/** Facts ride the thread-facts stream to every client, so a workflow writes status, not data. */
const MAX_FACT_BYTES = 16 * 1024;

/** Why a workflow may not write these facts, or undefined when it may. */
export const factsRefusal = (extensions: Readonly<Record<string, unknown>>) => {
  const reserved = reservedFactKey(extensions);
  if (reserved !== undefined) return `Fact key ${reserved} is the host's.`;
  return JSON.stringify(extensions).length > MAX_FACT_BYTES
    ? `Facts are limited to ${MAX_FACT_BYTES} bytes per call; keep status, not data.`
    : undefined;
};
