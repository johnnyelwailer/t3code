/**
 * Reply-affordance planning for the ask verbs (Epic 25 §askUser decision cards). Given an ask's
 * schema + render opts, derive the affordance descriptor that rides in the verb payload, the
 * prompt instructions, and the reply coercion — so `askVerb` stays a thin dispatch loop and every
 * card-renderable affordance (choice / boolean / form) suppresses the JSON-reply instruction the
 * same way (its buttons/inputs are the instruction; the bare question shows).
 *
 * For an AGENT turn the schema instruction is not generic: `describeSchemaForPrompt` derives the
 * schema's actual shape + an example reply, so a workflow author never restates it in the prompt.
 * A `user.input` keeps the generic line — its reader is a human with an affordance.
 */

import type * as Schema from "effect/Schema";

import { type AskAffordance, schemaToAffordance } from "./t3work-sdk.affordance.ts";
import { normalizeAgentAttachments } from "./t3work-sdk.askAttachments.ts";
import { SCHEMA_INSTRUCTION, describeSchemaForPrompt } from "./t3work-sdk.schemaDescribe.ts";

/** Coerce a raw reply into a value a schema can decode: parse a JSON string (tolerating a
 * ```json fence); pass non-strings through; leave an unparseable string as-is so the decode fails
 * and the retry loop fires. */
function coerceJson(reply: unknown): unknown {
  if (typeof reply !== "string") return reply;
  const unfenced = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    return reply;
  }
}

export interface AskRenderPlan {
  readonly affordance: AskAffordance | undefined;
  /** Fields merged into the verb payload (the affordance descriptor + attachment refs; the
   * implicit `{ kind: "text" }` default is omitted to keep non-card asks byte-identical to
   * pre-card journals). */
  readonly renderFields: Record<string, unknown>;
  /** Suffix appended to the base prompt on the FIRST ask ("" for a card affordance). */
  readonly promptSuffix: string;
  /** Instruction appended on a corrective re-ask after a decode miss. */
  readonly correctiveInstruction: string;
  readonly coerceReply: (value: unknown) => unknown;
}

export function planAskRender(input: {
  readonly kind: "thread.turn" | "user.input";
  readonly schema: Schema.Schema<unknown> | undefined;
  readonly attachments: ReadonlyArray<unknown> | undefined;
  readonly labels: { readonly true: string; readonly false: string } | undefined;
}): AskRenderPlan {
  const { kind, schema } = input;
  // The affordance descriptor + attachment refs are user.input-only render hints; an agent turn
  // never renders a card.
  const affordance =
    kind === "user.input"
      ? schemaToAffordance(
          schema,
          input.labels === undefined ? undefined : { labels: input.labels },
        )
      : undefined;
  const choice = affordance?.kind === "choice" ? affordance : undefined;
  const rendered = affordance !== undefined && affordance.kind !== "text";
  // `user.input` attachments are external-resource refs the host renders as cards — passed
  // through verbatim so decision-card payloads stay byte-identical. A `thread.turn`'s are the
  // author's structured data: named here, serialized once by the host at dispatch.
  const refs =
    kind === "user.input" ? input.attachments : normalizeAgentAttachments(input.attachments);
  // The implicit schema description is for AGENTS only: a `user.input` is read by a human, whose
  // affordance (buttons/inputs, or the freeform reply box) is the instruction. Deriving it here
  // and nowhere else keeps rendered decision cards byte-identical to pre-card journals.
  const described =
    kind === "thread.turn" && schema !== undefined ? describeSchemaForPrompt(schema) : undefined;
  const correctiveInstruction =
    choice !== undefined
      ? `Reply with exactly one of: ${choice.options.join(", ")}.`
      : affordance?.kind === "boolean"
        ? "Reply with true or false."
        : (described ?? SCHEMA_INSTRUCTION);
  // A reply that IS one of a choice's offered options is the literal value (field-wrapped for a
  // fielded choice); JSON-coercing it would corrupt parseable options ("true"→bool, "42"→num).
  const coerceReply = (value: unknown): unknown => {
    if (choice !== undefined && typeof value === "string" && choice.options.includes(value)) {
      return choice.field === undefined ? value : { [choice.field]: value };
    }
    return coerceJson(value);
  };
  return {
    affordance,
    renderFields: {
      ...(rendered ? { affordance } : {}),
      ...(refs === undefined || refs.length === 0 ? {} : { attachments: refs }),
    },
    promptSuffix: schema === undefined || rendered ? "" : `\n\n${described ?? SCHEMA_INSTRUCTION}`,
    correctiveInstruction,
    coerceReply,
  };
}
