/**
 * The ask-verb dispatch loop (Epic 25 §The thread model), extracted from
 * `t3work-sdk.threadPrimitives.ts` so each module stays inside the additive-guard LOC cap: this
 * file owns "drive one ask and enforce its schema", the primitives file owns the author-facing
 * `Thread` surface.
 *
 * One ask = one `sent`/`resolved` pair on the Handle dispatch. With a `schema`, a decode mismatch
 * re-asks (fresh turn, fresh `seq`) up to {@link MAX_SCHEMA_ATTEMPTS} times — restating the
 * schema-derived instruction each time — before throwing {@link SchemaExhaustedError}. Every
 * attempt is journaled, so the loop replays.
 *
 * The payload is a pure function of (replay-stable) schema + opts — including the derived schema
 * description and the named attachments — so it, and its `argsHash`, re-derive identically on
 * replay.
 */

import { planAskRender } from "./t3work-sdk.askRender.ts";
import type { MessageBroker } from "./t3work-sdk.broker.ts";
import { SchemaExhaustedError } from "./t3work-sdk.errors.ts";
import type { HandleDispatch, ReplyResolver } from "./t3work-sdk.handles.ts";
import { decodeWithSchema } from "./t3work-sdk.internal.ts";
import type { AnyAskOpts } from "./t3work-sdk.threadTypes.ts";
import type { ModelSelection } from "./t3work-sdk.types.ts";

/** One attempt + two corrective retries. */
const MAX_SCHEMA_ATTEMPTS = 3;

export type ThreadEnvelopeKind = "thread.turn" | "thread.message" | "user.input";

/** Curried `broker.send` for one envelope, matching the `fire` shape the dispatch expects. */
export const createFireEnvelope =
  (broker: MessageBroker) =>
  (kind: ThreadEnvelopeKind, payload: unknown) =>
  (correlationId: string, resolver: ReplyResolver): Promise<void> =>
    broker.send({ correlationId, kind, payload }, resolver);

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
    let prompt = `${basePrompt}${plan.promptSuffix}`;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const payload = {
        threadId,
        [promptField]: prompt,
        ...(opts?.label === undefined ? {} : { label: opts.label }),
        ...plan.renderFields,
        ...(model === undefined ? {} : { model }),
        ...(opts?.effort === undefined ? {} : { effort: opts.effort }),
      };
      const correlationId = await deps.dispatch.send({
        kind,
        refId: kind,
        args: payload,
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
            `${kind} on thread '${threadId}' did not satisfy the response schema after ${attempt} attempts: ${detail}`,
          );
        }
        prompt = `${basePrompt}\n\nYour previous reply did not match the required schema (${detail}). ${plan.correctiveInstruction}`;
      }
    }
  };
}
