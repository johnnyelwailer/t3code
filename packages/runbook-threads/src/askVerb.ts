/**
 * The ask-verb dispatch loop (Epic 25 §The thread model), extracted from
 * `primitives.ts` so each module stays focused: this
 * file owns "drive one ask and enforce its schema", the primitives file owns the author-facing
 * `Thread` surface.
 *
 * One ask = one `sent`/`resolved` pair on the Handle dispatch. With a `schema`, a decode mismatch
 * re-asks (fresh turn, fresh `seq`) up to {@link MAX_SCHEMA_ATTEMPTS} times — quoting the agent's
 * own reply back beside the schema (see schemaCorrection.ts) — before throwing
 * {@link SchemaExhaustedError}. Every attempt is journaled, so the loop replays.
 *
 * The payload is a pure function of (replay-stable) schema + opts — including the derived schema
 * description and the named attachments — so it, and its `argsHash`, re-derive identically on
 * replay.
 */

import { planAskRender } from "./askRender.ts";
import type { MessageBroker } from "./broker.ts";
import { SchemaExhaustedError } from "@runbook/core/errors";
import type { FireDelivery, HandleDispatch, ReplyResolver } from "@runbook/core/handles";
import { decodeWithSchema } from "@runbook/core/schema";
import type { AnyAskOpts } from "./types.ts";
import type { ModelSelection } from "./models.ts";
import { correctivePrompt, exhaustedReason, legacyCorrectivePrompt } from "./schemaCorrection.ts";

/** One attempt + two corrective retries. */
const MAX_SCHEMA_ATTEMPTS = 3;

export type ThreadEnvelopeKind = "thread.turn" | "thread.message" | "user.input";

/** Curried `broker.send` for one envelope, matching the `fire` shape the dispatch expects. A
 * re-fire's `delivery` marker rides on the envelope, never in the (hashed) payload. */
export const createFireEnvelope =
  (broker: MessageBroker) =>
  (kind: ThreadEnvelopeKind, payload: unknown) =>
  (correlationId: string, resolver: ReplyResolver, delivery?: FireDelivery): Promise<void> =>
    broker.send(
      {
        correlationId,
        kind,
        payload,
        ...(delivery?.redelivery === true ? { redelivery: true as const } : {}),
      },
      resolver,
    );

export type AskVerb = <R>(
  kind: "thread.turn" | "user.input",
  threadId: string,
  basePrompt: string,
  opts: AnyAskOpts<R> | undefined,
) => Promise<R>;

export function createAskVerb(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly defaultModel: ModelSelection | undefined;
}): AskVerb {
  const fireEnvelope = createFireEnvelope(deps.broker);
  return async <R>(
    kind: "thread.turn" | "user.input",
    threadId: string,
    basePrompt: string,
    opts: AnyAskOpts<R> | undefined,
  ): Promise<R> => {
    const schema = opts?.schema;
    const model = opts?.model ?? deps.defaultModel;
    const promptField = kind === "thread.turn" ? "prompt" : "question";
    // A `user.input` carries everything the host needs to render the decision card: the affordance
    // descriptor derived from the schema (the live schema object stays inside the runtime), the
    // attachment refs, and the prompt/coercion the affordance implies.
    const plan = planAskRender({
      kind,
      schema,
      attachments: opts?.attachments,
      labels: opts?.labels,
    });
    const payloadFor = (text: string) => ({
      threadId,
      [promptField]: text,
      ...(opts?.label === undefined ? {} : { label: opts.label }),
      ...plan.renderFields,
      ...(model === undefined ? {} : { model }),
      ...(opts?.effort === undefined ? {} : { effort: opts.effort }),
    });
    let prompt = `${basePrompt}${plan.promptSuffix}`;
    // The pre-rewording corrective prompt, so journals recorded by the previous version replay.
    let legacyPrompt: string | undefined;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const payload = payloadFor(prompt);
      const correlationId = await deps.dispatch.send({
        kind,
        refId: kind,
        args: payload,
        ...(legacyPrompt === undefined || legacyPrompt === prompt
          ? {}
          : { legacyArgs: [payloadFor(legacyPrompt)] }),
        fire: fireEnvelope(kind, payload),
      });
      const reply = await deps.dispatch.awaitResolution<unknown>(correlationId, undefined);
      if (schema === undefined) return String(reply) as R;
      try {
        return await decodeWithSchema(schema, plan.coerceReply(reply), "Invalid thread reply");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (attempt >= MAX_SCHEMA_ATTEMPTS) {
          throw new SchemaExhaustedError(
            exhaustedReason({ kind, threadId, attempts: attempt, schema, detail, reply }),
          );
        }
        const instruction = plan.correctiveInstruction;
        prompt = correctivePrompt({ kind, basePrompt, detail, reply, instruction });
        legacyPrompt = legacyCorrectivePrompt({ basePrompt, detail, instruction });
      }
    }
  };
}
