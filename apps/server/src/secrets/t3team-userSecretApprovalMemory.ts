/**
 * What "allow and remember" covers, in memory only: per thread for `perThread` entries, for every
 * thread on this server for `perMachine` entries. Keys hold the entry's whole policy, so a changed
 * entry is a new key and asks again; a restart or another machine starts empty.
 */
import type { ThreadId, UserSecretGrant, UserSecretRememberScope } from "@t3tools/contracts";

import {
  grantPolicyKey,
  needsPrompt,
  rememberScopeOf,
  strictestApproval,
} from "./t3team-userSecretGrants.ts";

interface ApprovalAsk {
  readonly consumerId: string;
  readonly threadId: ThreadId | undefined;
  readonly grants: ReadonlyArray<UserSecretGrant>;
}

export function makeApprovalMemory() {
  const remembered = new Set<string>();
  const threadKey = (consumerId: string, grant: UserSecretGrant) =>
    JSON.stringify(["thread", consumerId, grantPolicyKey(grant)]);
  const machineKey = (grant: UserSecretGrant) => JSON.stringify(["machine", grantPolicyKey(grant)]);

  const covered = (input: ApprovalAsk, grant: UserSecretGrant) =>
    !needsPrompt(grant.approval) ||
    (grant.approval !== "everyUse" && remembered.has(threadKey(input.consumerId, grant))) ||
    (grant.approval === "perMachine" &&
      input.threadId !== undefined &&
      remembered.has(machineKey(grant)));

  /** The narrowest scope among the entries asked about, so "remember" never reaches wider. */
  const offeredScope = (
    grants: ReadonlyArray<UserSecretGrant>,
  ): UserSecretRememberScope | undefined => {
    const asked = grants.filter((grant) => needsPrompt(grant.approval));
    if (asked.some((grant) => grant.approval === "everyUse")) return undefined;
    return asked.some((grant) => grant.approval === "perThread")
      ? "thread"
      : rememberScopeOf(strictestApproval(asked));
  };

  const remember = (input: ApprovalAsk, scope: UserSecretRememberScope) => {
    for (const grant of input.grants.filter((candidate) => needsPrompt(candidate.approval))) {
      remembered.add(scope === "machine" ? machineKey(grant) : threadKey(input.consumerId, grant));
    }
  };

  return { covered, offeredScope, remember };
}
