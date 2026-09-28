import type { EnvironmentId } from "@t3tools/contracts";

/**
 * The environment a t3team chat thread runs on: the one that owns its project.
 *
 * Projects can live on any connected environment — a cloud session's project
 * is on that machine — and its threads must be created and driven there; the
 * primary server rejects them ("Project … does not exist"). The primary is only
 * the fallback while the project is not known yet (a brand-new local project
 * whose `project.create` has not landed).
 */
export function resolveThreadChatEnvironmentId(
  project: { readonly environmentId: EnvironmentId } | null | undefined,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  return project?.environmentId ?? primaryEnvironmentId;
}
