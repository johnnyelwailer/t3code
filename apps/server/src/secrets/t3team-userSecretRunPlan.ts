/**
 * What one run asks for, checked binding by binding before anything is resolved: the grant, the
 * delivery mode the binding implies, and where its value may go. A `request` binding goes through
 * request injection to its own concrete host; `file` and `env` bindings through process injection
 * to the run's declared destination.
 */
import type {
  UserSecretDeliveryMode,
  UserSecretGrant,
  UserSecretProcessBinding,
  UserSecretRunInput,
} from "@t3tools/contracts";

import {
  checkGrantUse,
  userSecretRefusalMessage,
  type UserSecretRefusalReason,
} from "./t3team-userSecretGrants.ts";

export interface PlannedUse {
  readonly binding: UserSecretProcessBinding;
  readonly grant: UserSecretGrant;
  readonly mode: UserSecretDeliveryMode;
  readonly destination: string | undefined;
  readonly variable: string;
}

export type RunPlan =
  | { readonly uses: ReadonlyArray<PlannedUse> }
  | {
      readonly refused: {
        readonly name: string;
        readonly mode: UserSecretDeliveryMode;
        readonly reason: UserSecretRefusalReason | "duplicate_variable";
        readonly message: string;
      };
    };

const DEFAULT_SUFFIX = { file: "_FILE", env: "", request: "_BASE_URL" } as const;

const variableFor = (binding: UserSecretProcessBinding): string =>
  binding.variable ?? `${binding.name}${DEFAULT_SUFFIX[binding.as ?? "file"]}`;

const modeOf = (binding: UserSecretProcessBinding): UserSecretDeliveryMode =>
  binding.as === "request" ? "requestInjection" : "processInjection";

export function planRun(
  input: UserSecretRunInput,
  grantOf: (name: string) => UserSecretGrant | undefined,
  nowMillis: number,
): RunPlan {
  const uses: Array<PlannedUse> = [];
  const variables = new Set<string>();
  for (const binding of input.secrets) {
    const mode = modeOf(binding);
    const destination = mode === "requestInjection" ? binding.destination : input.destination;
    const grant = grantOf(binding.name);
    const concreteHostMissing =
      mode === "requestInjection" && (destination === undefined || destination.startsWith("*."));
    const reason = concreteHostMissing
      ? "destination_required"
      : checkGrantUse(binding.name, grant, mode, destination, nowMillis);
    if (reason !== undefined || grant === undefined) {
      const refusal = reason ?? "not_granted";
      return {
        refused: {
          name: binding.name,
          mode,
          reason: refusal,
          message: userSecretRefusalMessage(refusal, binding.name),
        },
      };
    }
    const variable = variableFor(binding);
    if (variables.has(variable)) {
      return {
        refused: {
          name: binding.name,
          mode,
          reason: "duplicate_variable",
          message: `Two secrets would set ${variable}.`,
        },
      };
    }
    variables.add(variable);
    uses.push({ binding, grant, mode, destination, variable });
  }
  return { uses };
}
