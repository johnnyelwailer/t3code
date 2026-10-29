/**
 * Where a user can get a credential for a running session, resolved on the machine the user is sitting
 * at: their signed-in `gh` for a host, an environment variable they named, or typing it. `probe` says
 * what exists without a value; `read` is the one call that returns a value, and a client makes it only
 * after the user chose that source on the card.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { UserSecretDestinationHost, UserSecretName } from "./t3team-userSecretInjection.ts";

export const CredentialScope = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9:_.-]+$/),
);

export const CredentialSourcesProbeInput = Schema.Struct({
  host: Schema.optional(UserSecretDestinationHost),
  name: Schema.optional(UserSecretName),
  scopes: Schema.optional(Schema.Array(CredentialScope).check(Schema.isMaxLength(16))),
});
export type CredentialSourcesProbeInput = typeof CredentialSourcesProbeInput.Type;

/** `unknown` when the token kind reports no scopes (fine-grained and app tokens). */
export const CredentialScopeCheck = Schema.Literals(["ok", "missing", "unknown"]);

export const GhCredentialSource = Schema.Struct({
  kind: Schema.Literal("gh"),
  host: UserSecretDestinationHost,
  account: Schema.String,
  scopeCheck: CredentialScopeCheck,
  missingScopes: Schema.Array(CredentialScope),
  /** The one-line fix when a requested scope is missing; never carries a token. */
  refreshCommand: Schema.optional(Schema.String),
});

export const EnvCredentialSource = Schema.Struct({
  kind: Schema.Literal("env"),
  name: UserSecretName,
  /** The value looks like a different kind of secret than the request names; its content is never shown. */
  warning: Schema.optional(Schema.Literal("different_secret_type")),
});

export const ManualCredentialSource = Schema.Struct({ kind: Schema.Literal("manual") });

export const CredentialSource = Schema.Union([
  GhCredentialSource,
  EnvCredentialSource,
  ManualCredentialSource,
]);
export type CredentialSource = typeof CredentialSource.Type;

export const CredentialSourcesProbeResult = Schema.Struct({
  sources: Schema.Array(CredentialSource),
});
export type CredentialSourcesProbeResult = typeof CredentialSourcesProbeResult.Type;

export const CredentialSourcesReadInput = Schema.Struct({
  source: Schema.Literals(["gh", "env"]),
  host: Schema.optional(UserSecretDestinationHost),
  name: Schema.optional(UserSecretName),
});
export type CredentialSourcesReadInput = typeof CredentialSourcesReadInput.Type;

/** The only schema here that carries a value. Clients hold it in memory only to answer the card. */
export const CredentialSourcesReadResult = Schema.Struct({ value: Schema.String });

export class CredentialSourcesError extends Schema.TaggedError<CredentialSourcesError>()(
  "CredentialSourcesError",
  { reason: Schema.Literals(["not_available", "invalid_request"]) },
) {
  override get message(): string {
    return this.reason === "not_available"
      ? "That source has no credential on this machine."
      : "A gh source needs a host and an env source needs a name.";
  }
}
