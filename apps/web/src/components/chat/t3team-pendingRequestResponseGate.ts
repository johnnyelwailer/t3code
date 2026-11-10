/**
 * Approve / Submit answer: only a KNOWN session lacking `orchestration:operate` blocks, always with
 * a message. Loading or failed session state (common on cloud sessions) lets the server decide,
 * so the respond commands skip `useOrchestrationCommand`'s client gate.
 */
import {
  AuthOrchestrationOperateScope,
  type AuthSessionState,
  sessionGrantsScope,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";

type PendingResponseGate =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

type PendingResponseKind = "approval" | "answer";

const ALLOW: PendingResponseGate = { ok: true };

const block = (message: string): PendingResponseGate => ({ ok: false, message });

/** The click's verdict. `request` is the request's own state (approval or question). */
export function pendingResponseGate(input: {
  readonly kind: PendingResponseKind;
  readonly hasThread: boolean;
  readonly session: AsyncResult.AsyncResult<AuthSessionState, unknown>;
  readonly request: "missing" | "ended" | "live";
}): PendingResponseGate {
  const noun = input.kind === "approval" ? "approval" : "answer";
  if (!input.hasThread) return block(`Could not send the ${noun}: no thread is open.`);
  if (input.request === "missing") {
    return block(`Could not send the ${noun}: the request is no longer pending.`);
  }
  if (input.request === "ended") {
    return block(
      `Could not send the ${noun}: the agent session that asked has ended. ` +
        "Send a message to continue.",
    );
  }
  // The last known session, even through a failed revalidation (a broker hiccup is not a denial).
  const session = Option.getOrNull(AsyncResult.value(input.session));
  if (session !== null && !sessionGrantsScope(session, AuthOrchestrationOperateScope)) {
    return block(
      `Could not send the ${noun}: this connection may only read this environment. ` +
        "Reconnect it with full access.",
    );
  }
  return ALLOW;
}

/** What to show when the server answer never came back (dropped connection, superseded call). */
export const pendingResponseInterruptedMessage = (kind: PendingResponseKind) =>
  `The ${kind === "approval" ? "approval" : "answer"} may not have reached the agent: ` +
  "the connection was interrupted. Try again.";

/** Submit on the last question with no complete answer used to do nothing. */
export const PENDING_ANSWER_INCOMPLETE_MESSAGE =
  "Answer every question before submitting: pick an option or type an answer.";
