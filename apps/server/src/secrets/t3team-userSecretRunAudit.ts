/**
 * The audit records one run produces: per binding for refusals, declines and process uses, and
 * per forwarded request for request injection (host, method, status). Never a value.
 */
import type {
  UserSecretApproval,
  UserSecretDeliveryMode,
  UserSecretUseAudit,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ForwardedRequest } from "./t3team-userSecretRequestForward.ts";
import type { PlannedUse } from "./t3team-userSecretRunPlan.ts";
import type { UserSecretAudit } from "./t3team-UserSecretAudit.ts";

export interface RunAuditContext {
  readonly audit: UserSecretAudit["Service"];
  readonly at: string;
  readonly consumer: string;
  readonly tool: string;
}

interface AuditedUse {
  readonly name: string;
  readonly mode: UserSecretDeliveryMode;
  readonly destination: string | undefined;
}

export const auditUses = (
  context: RunAuditContext,
  uses: ReadonlyArray<AuditedUse>,
  outcome: UserSecretUseAudit["outcome"],
  details: { readonly reason?: string; readonly approval?: UserSecretApproval } = {},
) =>
  Effect.forEach(
    uses,
    (use) =>
      context.audit.record({
        at: context.at,
        consumer: context.consumer,
        tool: context.tool,
        name: use.name,
        mode: use.mode,
        ...(use.destination === undefined ? {} : { destination: use.destination }),
        outcome,
        ...(details.reason === undefined ? {} : { reason: details.reason }),
        ...(details.approval === undefined ? {} : { approval: details.approval }),
      }),
    { discard: true },
  );

export const usesOf = (uses: ReadonlyArray<PlannedUse>): ReadonlyArray<AuditedUse> =>
  uses.map((use) => ({ name: use.binding.name, mode: use.mode, destination: use.destination }));

export const auditForwarded = (
  context: RunAuditContext,
  forwarded: ReadonlyArray<ForwardedRequest>,
  approval: UserSecretApproval,
) =>
  Effect.forEach(
    forwarded,
    (request) =>
      context.audit.record({
        at: context.at,
        consumer: context.consumer,
        tool: context.tool,
        name: request.name,
        mode: "requestInjection",
        destination: request.host,
        outcome: "used",
        approval,
        method: request.method,
        status: request.status,
      }),
    { discard: true },
  );
