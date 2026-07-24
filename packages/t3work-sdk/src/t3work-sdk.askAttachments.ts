/**
 * First-class attachments for agent asks (PR review: "I don't like stringifies… I'd like first
 * class apis so we can just pass objects as attachments" / "never inline any data. Always as
 * attachments").
 *
 * A workflow author passes the objects themselves —
 * `agent("Judge these gates", { label: "Judge gates", attachments: [gates] })` — and never calls
 * `JSON.stringify`, never string-concatenates data into a prompt. The runtime does the rest,
 * exactly once, at two distinct boundaries:
 *   • {@link normalizeAgentAttachments} names them and puts them in the verb payload as
 *     STRUCTURE, so the journal records data as data (and the argsHash covers it via the
 *     canonical-JSON encoder, key order and all — replay-stable);
 *   • {@link renderAgentAttachments} serializes them once at dispatch, when the host composes the
 *     provider-facing turn text.
 *
 * Anything that is not already a `{ name, value }` pair is taken as the value itself and named
 * positionally, so the common case (`attachments: [gates]`) needs no wrapper.
 */

import { canonicalJsonStringify } from "./t3work-sdk.canonicalJson.ts";

/** An attachment as the author writes it: a bare value, or a named one. */
export type AgentAttachment = unknown | { readonly name: string; readonly value: unknown };

/** An attachment as it rides in the verb payload and the journal. */
export interface NamedAttachment {
  readonly name: string;
  readonly value: unknown;
}

function isNamed(candidate: unknown): candidate is NamedAttachment {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return false;
  const record = candidate as Record<string, unknown>;
  return typeof record["name"] === "string" && "value" in record;
}

/**
 * Name every attachment (`{ name, value }` kept as-is, anything else named `data-<n>` by
 * position) and reject values that cannot be journaled as canonical JSON, naming the offender —
 * a loud failure at the call beats a corrupt journal line. Returns `undefined` for an empty or
 * absent list so the payload stays byte-identical to a call with no attachments.
 */
export function normalizeAgentAttachments(
  attachments: ReadonlyArray<AgentAttachment> | undefined,
): ReadonlyArray<NamedAttachment> | undefined {
  if (attachments === undefined || attachments.length === 0) return undefined;
  return attachments.map((attachment, index) => {
    const named: NamedAttachment = isNamed(attachment)
      ? { name: attachment.name, value: attachment.value }
      : { name: `data-${index + 1}`, value: attachment };
    // Args-mode canonicalization — the same mode `hashArgs` uses on the payload. Deliberately NOT
    // result-mode: an object literal built inside the workflow sandbox has that realm's prototype,
    // which result-mode rejects as a non-plain object.
    try {
      canonicalJsonStringify(named.value);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new TypeError(`Attachment '${named.name}' is not serializable as JSON: ${detail}`, {
        cause: error,
      });
    }
    return named;
  });
}

/**
 * The provider-facing rendering of an ask's attachments: one fenced JSON block per attachment,
 * appended after the prompt by the host when it composes the turn. Fenced JSON is what models
 * parse most reliably, and keeping the rendering here (rather than in the host) means the
 * agent-visible format has exactly one definition. Returns "" when there is nothing to attach.
 */
export function renderAgentAttachments(
  attachments: ReadonlyArray<NamedAttachment> | undefined,
): string {
  if (attachments === undefined || attachments.length === 0) return "";
  const blocks = attachments.map(
    (attachment) =>
      `### ${attachment.name}\n\`\`\`json\n${JSON.stringify(attachment.value, undefined, 2)}\n\`\`\``,
  );
  return `\n\n## Attached data\n\n${blocks.join("\n\n")}`;
}

/** Narrow an unknown payload field back to named attachments (host side: a journal from an older
 * build may carry anything, or nothing, in `attachments`). */
export function asNamedAttachments(value: unknown): ReadonlyArray<NamedAttachment> | undefined {
  if (!Array.isArray(value)) return undefined;
  const named = value.filter(isNamed);
  return named.length === 0 ? undefined : named;
}
