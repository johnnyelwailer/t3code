import type { ProjectMachineDiscovery } from "@t3tools/contracts";

/**
 * What "New cloud session" does for a project, read from the discovery the menu already loads.
 *
 * - `start`: create the session. The server pins a definition when there is one, and refuses with
 *   what to commit or push when it cannot; warm or cold stays the broker's choice.
 * - `fix`: a committed file looked like a definition and cannot be used. Nothing starts; the hint
 *   names the file and the reason.
 * - `setup`: the project has no machine, so the session sets one up on its own thread while the
 *   user works in it. Needs the setup flag; without it the session starts plain, as before.
 */
export type CloudSessionMachineChoice = "start" | "fix" | "setup";

export function cloudSessionMachineChoice(input: {
  /** Null while discovery is loading or when it failed: the server decides, as before. */
  readonly discovery: ProjectMachineDiscovery | null;
  readonly setupEnabled: boolean;
}): CloudSessionMachineChoice {
  const { discovery } = input;
  if (discovery === null) return "start";
  if (discovery.status._tag !== "None") return "start";
  if (discovery.rejected.length > 0) return "fix";
  return input.setupEnabled ? "setup" : "start";
}
