/**
 * The port between injection and wherever a user's secret values live. Grants are fixed when the
 * consumer starts (a session, or an automation run holding a standing grant); a name not granted
 * then is refused for the rest of it, so an agent cannot harvest arbitrary names. `resolve` is called only on an injection path and
 * hands the value out as `Redacted`, which logs and spans print as `<redacted>`.
 */
import type { UserSecretDeliveryMode, UserSecretGrant, UserSecretName } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import {
  userSecretRefusalMessage,
  type UserSecretRefusalReason,
} from "./t3team-userSecretGrants.ts";

export class UserSecretRefused extends Schema.TaggedError<UserSecretRefused>()(
  "UserSecretRefused",
  {
    name: Schema.String,
    reason: Schema.Literals([
      "not_granted",
      "expired",
      "login_slot",
      "mode_not_allowed",
      "destination_required",
      "destination_not_allowed",
      "unavailable",
    ]),
  },
) {
  override get message(): string {
    return this.reason === "unavailable"
      ? `${this.name} is granted but its value could not be read on this machine.`
      : userSecretRefusalMessage(this.reason satisfies UserSecretRefusalReason, this.name);
  }
}

export interface UserSecretResolveInput {
  readonly name: UserSecretName;
  readonly mode: UserSecretDeliveryMode;
  readonly destination?: string | undefined;
}

export class UserSecretResolver extends Context.Service<
  UserSecretResolver,
  {
    /** The session's grant for `name`: policy only, never the value. */
    readonly grant: (name: UserSecretName) => UserSecretGrant | undefined;
    readonly resolve: (
      input: UserSecretResolveInput,
    ) => Effect.Effect<Redacted.Redacted<string>, UserSecretRefused>;
  }
>()("t3/secrets/t3team-UserSecretResolver/UserSecretResolver") {}
