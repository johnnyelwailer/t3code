/**
 * Agent use of a user's secrets by injection: an agent names a granted entry and the host injects
 * its value into one command or one outgoing request. No schema here carries a value; the agent,
 * the transcript and the clients only ever see names, policies and outcomes.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProjectMachineSecret } from "./t3team-projectMachine.ts";

/** Same rule as a machine secret name: it becomes a file name and an environment variable. */
export const UserSecretName = ProjectMachineSecret.fields.name;
export type UserSecretName = typeof UserSecretName.Type;

/** `authSlot` is a provider login; it is never resolvable through agent tools. */
export const UserSecretEntryKind = Schema.Literals(["secret", "authSlot"]);
export type UserSecretEntryKind = typeof UserSecretEntryKind.Type;

/** How a value may leave the host. There is deliberately no mode that returns it. */
export const UserSecretDeliveryMode = Schema.Literals(["requestInjection", "processInjection"]);
export type UserSecretDeliveryMode = typeof UserSecretDeliveryMode.Type;

/**
 * When a use is approved. `standingGrant`: a user approved it in advance when the grant was made
 * (an unattended automation's grant), so nobody is asked at use time. `oncePerSession` and
 * `everyUse` need someone to ask; with nobody there, the use is declined.
 */
export const UserSecretApproval = Schema.Literals([
  "automatic",
  "standingGrant",
  "oncePerSession",
  "everyUse",
]);
export type UserSecretApproval = typeof UserSecretApproval.Type;

const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";

/** A lower-case host name, or `*.` plus at least two labels for any subdomain of that domain. */
export const UserSecretDestinationHost = Schema.String.check(
  Schema.isMaxLength(253),
  Schema.isPattern(
    new RegExp(`^(?:\\*\\.${HOST_LABEL}\\.${HOST_LABEL}|${HOST_LABEL})(?:\\.${HOST_LABEL})*$`),
  ),
);
export type UserSecretDestinationHost = typeof UserSecretDestinationHost.Type;

export const USER_SECRET_VALUE_PLACEHOLDER = "{value}";

/** The header request injection adds; the template holds `{value}` exactly once. */
export const UserSecretRequestHeader = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/)),
  template: Schema.String.check(
    Schema.isMaxLength(256),
    Schema.makeFilter((template) => template.split(USER_SECRET_VALUE_PLACEHOLDER).length === 2, {
      message: `The header template must contain ${USER_SECRET_VALUE_PLACEHOLDER} exactly once.`,
    }),
  ),
});
export type UserSecretRequestHeader = typeof UserSecretRequestHeader.Type;

export const DEFAULT_USER_SECRET_REQUEST_HEADER: UserSecretRequestHeader = {
  name: "Authorization",
  template: `Bearer ${USER_SECRET_VALUE_PLACEHOLDER}`,
};

/**
 * One entry a consumer may use: granted when a session starts, or a standing grant for an
 * automation. Host-neutral: the consumer may be an app thread or an unattended automation run.
 */
export const UserSecretGrant = Schema.Struct({
  name: UserSecretName,
  kind: UserSecretEntryKind,
  deliveryModes: Schema.Array(UserSecretDeliveryMode).check(Schema.isMinLength(1)),
  /** Hosts the value may be sent to. Required for request injection. */
  destinations: Schema.Array(UserSecretDestinationHost),
  approval: UserSecretApproval,
  requestHeader: Schema.optional(UserSecretRequestHeader),
  /** ISO time after which the grant is refused; standing grants carry one. */
  expiresAt: Schema.optional(Schema.String),
}).check(
  Schema.makeFilter(
    (grant) => !grant.deliveryModes.includes("requestInjection") || grant.destinations.length > 0,
    { message: "Request injection needs at least one destination host." },
  ),
);
export type UserSecretGrant = typeof UserSecretGrant.Type;

/** A consumer's grant list as delivered next to the values. Each name once. */
export const UserSecretGrantManifest = Schema.Struct({
  version: Schema.Literal(1),
  grants: Schema.Array(UserSecretGrant).check(
    Schema.makeFilter(
      (grants) => new Set(grants.map((grant) => grant.name)).size === grants.length,
    ),
  ),
});
export type UserSecretGrantManifest = typeof UserSecretGrantManifest.Type;

const EnvironmentVariableName = Schema.String.check(Schema.isPattern(/^[A-Z_][A-Z0-9_]{0,127}$/));

export const UserSecretProcessBinding = Schema.Struct({
  name: UserSecretName.annotate({ description: "A granted user secret, by name." }),
  as: Schema.optional(Schema.Literals(["file", "env"])).annotate({
    description:
      "file (default): the value is written to a private temporary file and the variable holds its path. env: the variable holds the value.",
  }),
  variable: Schema.optional(EnvironmentVariableName).annotate({
    description: "Environment variable to set. Default: <name>_FILE for file, <name> for env.",
  }),
});
export type UserSecretProcessBinding = typeof UserSecretProcessBinding.Type;

export const UserSecretRunInput = Schema.Struct({
  command: TrimmedNonEmptyString.check(Schema.isMaxLength(4000)).annotate({
    description: "One shell command line, run in this thread's workspace. Never put a value in it.",
  }),
  secrets: Schema.Array(UserSecretProcessBinding).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(8),
  ),
  destination: Schema.optional(UserSecretDestinationHost).annotate({
    description:
      "The host the command sends the secrets to. Required when an entry lists destinations; it must be one of them.",
  }),
  purpose: TrimmedNonEmptyString.check(Schema.isMaxLength(300)).annotate({
    description: "One line shown to the user when the use needs approval.",
  }),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 600_000 })),
  ),
});
export type UserSecretRunInput = typeof UserSecretRunInput.Type;

export const UserSecretRunResult = Schema.Struct({
  exitCode: Schema.NullOr(Schema.Number),
  timedOut: Schema.Boolean,
  stdout: Schema.String,
  stderr: Schema.String,
  truncated: Schema.Boolean,
  /** How many occurrences of an injected value (or an encoding of one) were masked. */
  maskedCount: Schema.Number,
});
export type UserSecretRunResult = typeof UserSecretRunResult.Type;

/** One audited use or refusal. Never carries a value. */
export const UserSecretUseAudit = Schema.Struct({
  at: Schema.String,
  /** Who used it: an app thread id, or an automation run id on another host. */
  consumer: TrimmedNonEmptyString,
  tool: Schema.String,
  name: Schema.String,
  mode: UserSecretDeliveryMode,
  destination: Schema.optional(Schema.String),
  outcome: Schema.Literals(["used", "refused", "declined"]),
  approval: Schema.optional(UserSecretApproval),
  reason: Schema.optional(Schema.String),
});
export type UserSecretUseAudit = typeof UserSecretUseAudit.Type;
