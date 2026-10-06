import type { ProjectMachineDiscovery } from "@t3tools/contracts";

export interface ProjectMachineHint {
  readonly label: string;
  /** Full sentence for the tooltip. */
  readonly detail: string;
  readonly tone: "info" | "warning";
}

/**
 * The words for a project's machine on the "New cloud session" item. Null when the project has no
 * definition at all: the session is a plain one, and saying so would be noise.
 */
export function presentProjectMachine(
  discovery: ProjectMachineDiscovery,
): ProjectMachineHint | null {
  if (discovery.status._tag === "Detected") {
    const { repository, devcontainerPath } = discovery.status.definition;
    const owner = repository === "." ? "this project" : repository;
    return {
      label:
        repository === "."
          ? "In this project's machine"
          : `In the ${repository.split("/").pop()} machine`,
      detail: `Runs in the devcontainer ${devcontainerPath} from ${owner}.`,
      tone: "info",
    };
  }
  const broken = discovery.rejected[0];
  if (broken === undefined) return null;
  return {
    label: "Machine needs fixing",
    detail: `${broken.path}: ${broken.reason}`,
    tone: "warning",
  };
}
