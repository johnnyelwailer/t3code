/**
 * Payload hash of a change-set operation. Synchronous and pure JS (no `crypto.subtle`, which plain
 * http LAN web and Hermes lack), so the server that writes it and every client that verifies it
 * produce the same digest from the same canonical JSON.
 */
import { sha256 } from "@noble/hashes/sha2";
import type {
  T3TeamDraftMutationPayload,
  WorkItemChangeSetOperation,
} from "@t3tools/contracts";
import * as Hex from "effect/encoding/Hex";

/** What a hash covers: everything an applying client acts on. */
type HashedDraft = Pick<T3TeamDraftMutationPayload, "target" | "field" | "patch">;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/** SHA-256 hex of the key-sorted JSON of the draft's target, field and patch. */
export const hashDraftPayload = (draft: HashedDraft): string =>
  Hex.encode(
    sha256(
      new TextEncoder().encode(
        canonicalJson({ target: draft.target, field: draft.field, patch: draft.patch }),
      ),
    ),
  );

/** False when the draft differs from what the change set recorded: do not apply it. */
export const verifyDraftPayloadHash = (
  draft: HashedDraft,
  operation: Pick<WorkItemChangeSetOperation, "payloadHash">,
): boolean => hashDraftPayload(draft) === operation.payloadHash;
