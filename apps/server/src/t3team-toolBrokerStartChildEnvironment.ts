import { EnvironmentId, type ThreadEnvironmentBinding } from "@t3tools/contracts";

export type T3TeamStartChildEnvironmentResult =
  | { readonly ok: true; readonly value: ThreadEnvironmentBinding | undefined }
  | { readonly ok: false; readonly message: string };

/**
 * The `environment` argument of `t3team.thread.start_child`: bind the child
 * session to a different execution environment (another T3 server) than the
 * one that creates the thread record.
 *
 * - absent / null / undefined → same environment as this server (byte-identical
 *   to pre-environment behavior: the thread.create command simply omits the
 *   `environment` field).
 * - `{ id, label? }` → cross-environment binding. `id` must be a non-empty
 *   EnvironmentId string (accepts the legacy `environment_id` key as well).
 *
 * Delivery boundary (documented at ThreadEnvironmentBinding in the contracts):
 * the thread record, handoff, and read model are stamped with the target
 * environment, but inter-agent messaging (send_message / mailbox / children
 * ops) remains same-environment. This parser validates shape only — whether
 * the target environment actually exists is a question for that environment's
 * server and is NOT verified here.
 */
export const readStartChildEnvironment = (value: unknown): T3TeamStartChildEnvironmentResult => {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "object" || globalThis.Array.isArray(value)) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child 'environment' must be an object: { id: <EnvironmentId string>, label?: string }. Omit the argument to keep the child in this environment.",
    };
  }
  const candidate = value as {
    readonly id?: unknown;
    readonly environment_id?: unknown;
    readonly label?: unknown;
  };
  const rawId = candidate.environment_id ?? candidate.id;
  if (typeof rawId !== "string" || rawId.trim().length === 0) {
    return {
      ok: false,
      message:
        "t3team.thread.start_child 'environment.id' must be a non-empty EnvironmentId string of the target environment.",
    };
  }
  const label =
    typeof candidate.label === "string" && candidate.label.trim().length > 0
      ? candidate.label.trim()
      : undefined;
  const environmentId = EnvironmentId.make(rawId.trim());
  return {
    ok: true,
    value: label !== undefined ? { environmentId, label } : { environmentId },
  };
};
