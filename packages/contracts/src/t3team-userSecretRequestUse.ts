/**
 * What an agent asks for with `request_secret`'s optional `use` block: a secret it can then use through
 * `t3_user_secret_run`, granted for this session when the user approves the card. It carries the same
 * policy fields as a broker-delivered `UserSecretGrant`, so both kinds are judged by the same rules.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  DEFAULT_USER_SECRET_APPROVAL,
  UserSecretApproval,
  UserSecretDeliveryMode,
  UserSecretDestinationHost,
  UserSecretName,
  UserSecretRequestHeader,
  type UserSecretGrant,
} from "./t3team-userSecretInjection.ts";

/** A request made mid-session is for this session's work, not for good. */
export const DEFAULT_REQUESTED_GRANT_MINUTES = 8 * 60;
export const MAX_REQUESTED_GRANT_MINUTES = 24 * 60;

export const UserSecretRequestUse = Schema.Struct({
  name: UserSecretName.check(
    Schema.makeFilter((name) => !name.startsWith("AUTH_SLOT_"), {
      message: "AUTH_SLOT_ names are provider logins and cannot be requested.",
    }),
  ).annotate({
    description: "The name you will bind in t3_user_secret_run; it is also the default variable.",
  }),
  host: Schema.optional(UserSecretDestinationHost).annotate({
    description:
      "The host this credential is for (e.g. npm.pkg.github.com). Offers the user's sign-in for that host and limits where a request-injected value may go.",
  }),
  scopes: Schema.optional(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(64))).check(Schema.isMaxLength(16)),
  ).annotate({
    description:
      "Scopes the credential needs, e.g. read:packages. Shown to the user and checked on a sign-in.",
  }),
  deliveryModes: Schema.optional(Schema.Array(UserSecretDeliveryMode).check(Schema.isMinLength(1))),
  destinations: Schema.optional(Schema.Array(UserSecretDestinationHost)),
  approval: Schema.optional(UserSecretApproval),
  requestHeader: Schema.optional(UserSecretRequestHeader),
  expiresInMinutes: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_REQUESTED_GRANT_MINUTES })),
  ),
});
export type UserSecretRequestUse = typeof UserSecretRequestUse.Type;

export function grantFromRequestUse(use: UserSecretRequestUse, nowMillis: number): UserSecretGrant {
  const destinations = use.destinations ?? (use.host === undefined ? [] : [use.host]);
  const minutes = use.expiresInMinutes ?? DEFAULT_REQUESTED_GRANT_MINUTES;
  return {
    name: use.name,
    kind: "secret",
    deliveryModes: use.deliveryModes ?? ["processInjection"],
    destinations,
    approval: use.approval ?? DEFAULT_USER_SECRET_APPROVAL,
    ...(use.requestHeader === undefined ? {} : { requestHeader: use.requestHeader }),
    expiresAt: new Date(nowMillis + minutes * 60_000).toISOString(),
  };
}
