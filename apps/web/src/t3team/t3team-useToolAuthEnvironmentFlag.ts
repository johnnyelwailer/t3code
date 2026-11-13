/**
 * Whether the machine a sign-in would actually run on has `INTEGRATIONS_TOOL_AUTH` on.
 * `useFeatureFlag` reads the PRIMARY server, the wrong machine for a thread on a cloud session:
 * the flag was on locally so Install appeared, while the cloud server refused every call.
 * @module t3team/useToolAuthEnvironmentFlag
 */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";

import { serverEnvironment } from "~/state/server";
import { readServerFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** `unknown` until the environment's config lands — the surface stays optimistic until then, and
 * a call made meanwhile still reports its own refusal inline. */
export type ToolAuthEnvironmentAvailability = "unknown" | "enabled" | "disabled";

export function useToolAuthEnvironmentAvailability(
  environmentId: EnvironmentId | null,
): ToolAuthEnvironmentAvailability {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  if (config === null) return "unknown";
  return readServerFeatureFlag(config, "INTEGRATIONS_TOOL_AUTH") ? "enabled" : "disabled";
}
