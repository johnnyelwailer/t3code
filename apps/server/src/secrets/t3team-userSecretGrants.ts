/**
 * The access rules for one use of a granted user secret, as pure functions so every injection
 * path (process and request) applies the same checks in the same order.
 */
import {
  DEFAULT_USER_SECRET_REQUEST_HEADER,
  USER_SECRET_VALUE_PLACEHOLDER,
  type UserSecretApproval,
  type UserSecretDeliveryMode,
  type UserSecretGrant,
  type UserSecretRememberScope,
} from "@t3tools/contracts";

export type UserSecretRefusalReason =
  | "not_granted"
  | "expired"
  | "login_slot"
  | "mode_not_allowed"
  | "destination_required"
  | "destination_not_allowed";

const REFUSAL_MESSAGES: Record<UserSecretRefusalReason, (name: string) => string> = {
  not_granted: (name) => `${name} is not granted here.`,
  expired: (name) => `The grant for ${name} has expired.`,
  login_slot: (name) => `${name} is a provider login and cannot be used by agent tools.`,
  mode_not_allowed: (name) => `${name} does not allow this kind of use.`,
  destination_required: (name) => `${name} may only be sent to its listed hosts; name the host.`,
  destination_not_allowed: (name) => `${name} may not be sent to that host.`,
};

export const userSecretRefusalMessage = (reason: UserSecretRefusalReason, name: string): string =>
  REFUSAL_MESSAGES[reason](name);

/** Lower-case, without a port or a trailing dot; undefined when nothing host-like is left. */
function normalizeHost(host: string): string | undefined {
  const withoutPort = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(withoutPort) && withoutPort.length > 0 ? withoutPort : undefined;
}

/** `*.example.com` matches any subdomain of example.com, never example.com itself. */
export function hostMatches(pattern: string, host: string): boolean {
  const normalized = normalizeHost(host);
  if (normalized === undefined) return false;
  if (!pattern.startsWith("*.")) return normalized === pattern;
  return normalized.endsWith(pattern.slice(1)) && normalized.length > pattern.length - 1;
}

export function checkGrantUse(
  name: string,
  grant: UserSecretGrant | undefined,
  mode: UserSecretDeliveryMode,
  destination: string | undefined,
  nowMillis: number,
): UserSecretRefusalReason | undefined {
  if (grant === undefined) return "not_granted";
  if (grant.kind !== "secret") return "login_slot";
  if (grant.expiresAt !== undefined && !(Date.parse(grant.expiresAt) > nowMillis)) return "expired";
  if (!grant.deliveryModes.includes(mode)) return "mode_not_allowed";
  if (grant.destinations.length === 0) return undefined;
  if (destination === undefined) return "destination_required";
  return grant.destinations.some((pattern) => hostMatches(pattern, destination))
    ? undefined
    : "destination_not_allowed";
}

const APPROVAL_STRICTNESS: Record<UserSecretApproval, number> = {
  never: 0,
  standingGrant: 1,
  perMachine: 2,
  perThread: 3,
  everyUse: 4,
};

/** The approval one use needs when it names several entries: the strictest of them. */
export const strictestApproval = (grants: ReadonlyArray<UserSecretGrant>): UserSecretApproval =>
  grants.reduce<UserSecretApproval>(
    (strictest, grant) =>
      APPROVAL_STRICTNESS[grant.approval] > APPROVAL_STRICTNESS[strictest]
        ? grant.approval
        : strictest,
    "never",
  );

/** Whether a use needs someone to answer now; standing grants were approved when they were made. */
export const needsPrompt = (approval: UserSecretApproval): boolean =>
  approval === "perMachine" || approval === "perThread" || approval === "everyUse";

/** How far "remember" may reach for this approval; undefined when every use asks. */
export const rememberScopeOf = (
  approval: UserSecretApproval,
): UserSecretRememberScope | undefined =>
  approval === "perMachine" ? "machine" : approval === "perThread" ? "thread" : undefined;

/**
 * Identifies an entry's policy, not just its name: an approval remembered for one policy does not
 * cover the entry once its kind, modes, destinations, approval, header or expiry change.
 */
export const grantPolicyKey = (grant: UserSecretGrant): string =>
  JSON.stringify([
    grant.name,
    grant.kind,
    [...grant.deliveryModes].toSorted(),
    [...grant.destinations].toSorted(),
    grant.approval,
    grant.requestHeader ?? null,
    grant.expiresAt ?? null,
  ]);

export function renderRequestHeader(
  grant: UserSecretGrant,
  value: string,
): { readonly name: string; readonly value: string } {
  const header = grant.requestHeader ?? DEFAULT_USER_SECRET_REQUEST_HEADER;
  return {
    name: header.name,
    value: header.template.replace(USER_SECRET_VALUE_PLACEHOLDER, () => value),
  };
}
