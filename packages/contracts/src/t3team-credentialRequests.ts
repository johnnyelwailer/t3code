/**
 * What a session's card needs to show a credential request it is waiting on, and to revoke one that was
 * granted: asked of the environment the session runs in (the cloud machine), not of the user's own
 * machine (that is `credentialSources`). Never carries a value.
 */
import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  UserSecretApproval,
  UserSecretDeliveryMode,
  UserSecretDestinationHost,
  UserSecretName,
} from "./t3team-userSecretInjection.ts";
import { UserSecretRequestUse } from "./t3team-userSecretRequestUse.ts";

export const CredentialRequestsListInput = Schema.Struct({ threadId: ThreadId });
export type CredentialRequestsListInput = typeof CredentialRequestsListInput.Type;

export const PendingCredentialRequestView = Schema.Struct({
  turnItemId: TrimmedNonEmptyString,
  use: UserSecretRequestUse,
});

export const GrantedCredentialView = Schema.Struct({
  name: UserSecretName,
  approval: UserSecretApproval,
  deliveryModes: Schema.Array(UserSecretDeliveryMode),
  destinations: Schema.Array(UserSecretDestinationHost),
  expiresAt: Schema.optional(Schema.String),
});

export const CredentialRequestsListResult = Schema.Struct({
  pending: Schema.Array(PendingCredentialRequestView),
  granted: Schema.Array(GrantedCredentialView),
});
export type CredentialRequestsListResult = typeof CredentialRequestsListResult.Type;

export const CredentialRequestsRevokeInput = Schema.Struct({ name: UserSecretName });
export type CredentialRequestsRevokeInput = typeof CredentialRequestsRevokeInput.Type;

/** Whether a grant existed; the value went with it. */
export const CredentialRequestsRevokeResult = Schema.Struct({ revoked: Schema.Boolean });
