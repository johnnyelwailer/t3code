/**
 * The app's approval card for a user-secret use: the request a client shows and the user's answer.
 * One host's way to ask; an unattended host relies on standing grants instead and never asks.
 */
import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  UserSecretDeliveryMode,
  UserSecretDestinationHost,
  UserSecretName,
} from "./t3team-userSecretInjection.ts";

export const UserSecretApprovalDecision = Schema.Literals(["allowOnce", "allowForSession", "deny"]);
export type UserSecretApprovalDecision = typeof UserSecretApprovalDecision.Type;

/** What the user is asked to approve. Agent-written text is shown as such, never as a value. */
export const UserSecretApprovalRequest = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  secretNames: Schema.Array(UserSecretName),
  mode: UserSecretDeliveryMode,
  command: Schema.optional(Schema.String),
  destination: Schema.optional(UserSecretDestinationHost),
  purpose: Schema.String,
  /** False when an entry asks for approval on every use. */
  sessionApprovalAllowed: Schema.Boolean,
  requestedAt: Schema.String,
});
export type UserSecretApprovalRequest = typeof UserSecretApprovalRequest.Type;

export const UserSecretApprovalsSubscribeInput = Schema.Struct({ threadId: ThreadId });
export type UserSecretApprovalsSubscribeInput = typeof UserSecretApprovalsSubscribeInput.Type;

export const UserSecretApprovalsSnapshot = Schema.Struct({
  pending: Schema.Array(UserSecretApprovalRequest),
});
export type UserSecretApprovalsSnapshot = typeof UserSecretApprovalsSnapshot.Type;

export const UserSecretApprovalAnswerInput = Schema.Struct({
  threadId: ThreadId,
  approvalId: TrimmedNonEmptyString,
  decision: UserSecretApprovalDecision,
});
export type UserSecretApprovalAnswerInput = typeof UserSecretApprovalAnswerInput.Type;

export class UserSecretApprovalAnswerError extends Schema.TaggedError<UserSecretApprovalAnswerError>()(
  "UserSecretApprovalAnswerError",
  { reason: Schema.Literals(["not_found", "session_not_allowed"]) },
) {
  override get message(): string {
    return this.reason === "not_found"
      ? "This approval is no longer pending."
      : "This secret needs approval on every use.";
  }
}
