import type { ProjectMachineDiscovery } from "@t3tools/contracts";

/**
 * What "New cloud session" does for a project, read from the discovery the menu already loads.
 *
 * - `start`: create the session. The server pins a definition when there is one, and refuses with
 *   what to commit or push when it cannot; warm or cold stays the broker's choice.
 * - `fix`: a committed file looked like a definition and cannot be used. Nothing starts; the hint
 *   names the file and the reason.
 * - `ask`: the project has no machine. Ask once whether to set one up.
 *
 * `ask` needs the setup flag, a project on the primary environment, and no earlier "No" for it.
 * Without the flag the item behaves exactly as before: a project with no machine starts plain.
 */
export type CloudSessionMachineChoice = "start" | "fix" | "ask";

export function cloudSessionMachineChoice(input: {
  /** Null while discovery is loading or when it failed: the server decides, as before. */
  readonly discovery: ProjectMachineDiscovery | null;
  readonly setupEnabled: boolean;
  /** The user already answered "No" for this project. */
  readonly declined: boolean;
}): CloudSessionMachineChoice {
  const { discovery } = input;
  if (discovery === null) return "start";
  if (discovery.status._tag !== "None") return "start";
  if (discovery.rejected.length > 0) return "fix";
  return input.setupEnabled && !input.declined ? "ask" : "start";
}

/** The key a "No" is remembered under: per environment and project, kept in this browser. */
export function declinedMachineSetupKey(project: {
  readonly environmentId: string;
  readonly projectId: string;
}): string {
  return `${project.environmentId}\u0000${project.projectId}`;
}
