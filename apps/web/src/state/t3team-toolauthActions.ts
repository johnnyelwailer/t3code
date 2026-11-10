import type { EnvironmentId } from "@t3tools/contracts";

/** Prefer the thread/cloud machine; fall back to the primary only when none was given. */
export function resolveToolAuthEnvironmentId(
  targetEnvironmentId: EnvironmentId | null | undefined,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  return targetEnvironmentId ?? primaryEnvironmentId;
}

/** Visible failure when Install/Connect has no machine to run on. */
export function missingToolAuthEnvironmentError(
  label: string,
  action: string,
): {
  readonly title: string;
  readonly description: string;
} {
  return {
    title: `Could not ${action} ${label}`,
    description: "No cloud session environment is available to run this on yet.",
  };
}
