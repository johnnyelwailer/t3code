/**
 * The user-secret injection services as one layer for the server: the directory resolver (the
 * broker-backed store, hive/nx-nexi#659, replaces it behind the same port), approvals, the audit
 * log, and both injection modes.
 */
import * as Layer from "effect/Layer";

import { UserSecretApprovalsLive } from "./t3team-UserSecretApprovals.ts";
import { UserSecretAuditLogLive } from "./t3team-UserSecretAudit.ts";
import { UserSecretDirectoryResolverLive } from "./t3team-userSecretDirectoryResolver.ts";
import { UserSecretProcessInjectionLive } from "./t3team-UserSecretProcessInjection.ts";
import { UserSecretRequestInjectionLive } from "./t3team-UserSecretRequestInjection.ts";

const UserSecretFoundationLive = Layer.mergeAll(
  UserSecretDirectoryResolverLive,
  UserSecretApprovalsLive,
  UserSecretAuditLogLive,
);

export const UserSecretInjectionLive = Layer.mergeAll(
  UserSecretProcessInjectionLive,
  UserSecretRequestInjectionLive,
).pipe(Layer.provideMerge(UserSecretFoundationLive));
