import type { AccountStatus, EnvironmentId } from "@t3tools/contracts";

/** The registered environments the phone reaches through the Nexi broker. */
export function brokerEnvironmentIds(catalog: {
  readonly entries: ReadonlyMap<EnvironmentId, { readonly target: { readonly _tag: string } }>;
}): ReadonlyArray<EnvironmentId> {
  return [...catalog.entries]
    .filter(([, entry]) => entry.target._tag === "BrokerConnectionTarget")
    .map(([environmentId]) => environmentId);
}

/**
 * Broker environments cannot connect without the Microsoft account: the broker answers
 * `broker_sign_in_required`, which the gateway turns into a blocked connection. Offer the sign-in
 * while any is registered and the account is not signed in (a grant Entra rejects signs it out).
 */
export function needsBrokerSignIn(
  brokerEnvironments: ReadonlyArray<EnvironmentId>,
  account: AccountStatus | null,
): boolean {
  return brokerEnvironments.length > 0 && account !== null && account.auth._tag !== "SignedIn";
}

/** True on the change that should reconnect blocked broker environments: becoming signed in. */
export function becameSignedIn(previous: AccountStatus | null, next: AccountStatus | null) {
  return previous !== null && previous.auth._tag !== "SignedIn" && next?.auth._tag === "SignedIn";
}
