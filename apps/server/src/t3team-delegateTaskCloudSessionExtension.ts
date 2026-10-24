/**
 * The delegate_task `cloudSession` extension's input side: the option it advertises and its
 * parsing. Placement is `t3team-delegateTaskCloudSession.ts`.
 */
import type { DelegatedTaskExtensionOption } from "./mcp/t3team-delegatedTaskPreparation.ts";
import type { ParseResult } from "./t3team-delegateTaskExtensions.ts";

export const CLOUD_SESSION_EXTENSION: DelegatedTaskExtensionOption = {
  key: "cloudSession",
  description:
    "'auto' | 'new' | <cloud session id>: run the child on a Nexi cloud session for this project's repository. 'auto' uses a ready or starting session with room (3 children each), else starts one; 'new' starts one; an id uses that session. The child's turns run there with the requested provider and model (the delegation fails if the session does not offer them); its messages and completion come back here. Not combinable with workspace isolation; attachments are refused (send their content as text).",
};

/** The extension is offered only when the placement exists (flag on). */
export const withCloudSessionExtension = (
  base: ReadonlyArray<DelegatedTaskExtensionOption>,
  placementAvailable: boolean,
): ReadonlyArray<DelegatedTaskExtensionOption> =>
  placementAvailable ? [...base, CLOUD_SESSION_EXTENSION] : base;

export type CloudSessionRequest =
  | { readonly kind: "auto" }
  | { readonly kind: "new" }
  | { readonly kind: "session"; readonly sessionId: string };

export function parseCloudSessionExtension(
  value: unknown,
): ParseResult<CloudSessionRequest | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") {
    return {
      ok: false,
      message:
        "extensions.cloudSession must be 'auto', 'new' or a cloud session id. Omit it to leave cloud sessions alone.",
    };
  }
  if (text === "auto" || text === "new") return { ok: true, value: { kind: text } };
  return { ok: true, value: { kind: "session", sessionId: text } };
}
