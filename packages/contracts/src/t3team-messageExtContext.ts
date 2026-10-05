/**
 * Carrier for a user message's `T3TeamMessageExt` on V2.
 *
 * V2 user messages have no fork extension field; the ext rides the message's
 * `context.records` as one unreferenced `UnknownContextRecord` of kind
 * `t3team-message-ext`. Unreferenced records are persisted with the message but never
 * projected into the provider prompt (`projectComposerContextForProvider` emits only
 * records the text references), so the ext stays metadata for clients and fork
 * server layers.
 *
 * A record that does not decode (payload over the 64 KB record limit, bad shape) is
 * dropped on the way in, exactly like any other undecodable context record.
 */
import * as Schema from "effect/Schema";

import { type OrchestrationMessageContext, UnknownContextRecord } from "./composerContext.ts";
import { T3TeamMessageExt } from "./t3team-message-ext.ts";

export const T3TEAM_MESSAGE_EXT_CONTEXT_KIND = "t3team-message-ext";
const T3TEAM_MESSAGE_EXT_CONTEXT_ID = "t3team-message-ext";

const decodeRecord = Schema.decodeUnknownOption(UnknownContextRecord);
const decodeExt = Schema.decodeUnknownOption(T3TeamMessageExt);
const encodeExt = Schema.encodeSync(T3TeamMessageExt);

/**
 * Returns `context` with the ext record set (replacing an earlier one). Returns
 * `context` unchanged when the ext cannot ride a context record.
 */
export function withT3TeamMessageExtContext(
  ext: T3TeamMessageExt,
  context?: OrchestrationMessageContext,
): OrchestrationMessageContext | undefined {
  const record = decodeRecord({
    version: 1,
    contextId: T3TEAM_MESSAGE_EXT_CONTEXT_ID,
    label: "t3team",
    kind: T3TEAM_MESSAGE_EXT_CONTEXT_KIND,
    payload: encodeExt(ext),
  });
  if (record._tag === "None") return context;
  const others = (context?.records ?? []).filter(
    (candidate) => candidate.kind !== T3TEAM_MESSAGE_EXT_CONTEXT_KIND,
  );
  return { version: 1, records: [...others, record.value] };
}

/** The ext a message carries in its context, if any. */
export function readT3TeamMessageExtContext(
  context: OrchestrationMessageContext | null | undefined,
): T3TeamMessageExt | undefined {
  const record = context?.records.find(
    (candidate) => candidate.kind === T3TEAM_MESSAGE_EXT_CONTEXT_KIND,
  );
  if (record === undefined || !("payload" in record)) return undefined;
  const ext = decodeExt(record.payload);
  return ext._tag === "Some" ? ext.value : undefined;
}
