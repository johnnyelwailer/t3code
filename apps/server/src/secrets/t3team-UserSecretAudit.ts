/**
 * Every use and refusal of a user secret is recorded with the session, tool, entry name and
 * destination. The record type has no field for a value, so an adapter cannot write one.
 * The default adapter writes the server log, where the session's log shipping picks it up.
 */
import type { UserSecretUseAudit } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class UserSecretAudit extends Context.Service<
  UserSecretAudit,
  { readonly record: (entry: UserSecretUseAudit) => Effect.Effect<void> }
>()("t3/secrets/t3team-UserSecretAudit/UserSecretAudit") {}

export const UserSecretAuditLogLive = Layer.succeed(
  UserSecretAudit,
  UserSecretAudit.of({
    record: (entry) =>
      Effect.logInfo("user secret use").pipe(
        Effect.annotateLogs({
          "user_secret.consumer": entry.consumer,
          "user_secret.tool": entry.tool,
          "user_secret.name": entry.name,
          "user_secret.mode": entry.mode,
          "user_secret.destination": entry.destination ?? "",
          "user_secret.outcome": entry.outcome,
          "user_secret.reason": entry.reason ?? "",
          "user_secret.approval": entry.approval ?? "",
          "user_secret.at": entry.at,
        }),
      ),
  }),
);
