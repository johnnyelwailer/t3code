import type { AccountListResult, AccountStatus } from "@t3tools/contracts";

import { credentialRequest } from "./t3team-credentialRequest";

/** The accounts this machine's server signs the user in to (`/api/t3team/accounts`). */
const fallbackReason = "unavailable";
const path = (accountId: string, action: "sign-in" | "sign-out") =>
  `/api/t3team/accounts/${encodeURIComponent(accountId)}/${action}` as const;

export const accountsApi = {
  list: () =>
    credentialRequest<AccountListResult>("GET", "/api/t3team/accounts", { fallbackReason }),
  signIn: (accountId: string) =>
    credentialRequest<AccountStatus>("POST", path(accountId, "sign-in"), { fallbackReason }),
  signOut: (accountId: string) =>
    credentialRequest<{ ok: true }>("POST", path(accountId, "sign-out"), { fallbackReason }),
};
