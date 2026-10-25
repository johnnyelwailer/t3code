/**
 * The ownership rule for a project's machine: a cloud session for a project builds the machine its
 * OWN repository defines (the main checkout, `repository === "."`). A definition found in a
 * repository the project merely links (a reference, a QA fixture, a sibling service) describes
 * that repository, not this project, so it is reported but never becomes the project's machine.
 * Without an own definition the project's cloud session is a plain one.
 *
 * Pure: discovery feeds it what it scanned, and the cloud-session resolver reads the outcome.
 *
 * @module t3team-projectMachineOwnership
 */
import type { ProjectMachineDiscovery, ProjectMachineRejectedCandidate } from "@t3tools/contracts";

import type { ScannedMachine } from "./t3team-machineDefinitionScan.ts";

/** `ProjectMachineDefinition.repository` of the project's own checkout. */
export const OWN_REPOSITORY = ".";

interface Source {
  readonly machine: ScannedMachine;
}

/** Own definitions first, then a committed pointer over a plain devcontainer, then by name. */
const compareSources = (a: Source, b: Source) =>
  Number(a.machine.repository !== OWN_REPOSITORY) -
    Number(b.machine.repository !== OWN_REPOSITORY) ||
  Number(a.machine.machineFilePath === null) - Number(b.machine.machineFilePath === null) ||
  a.machine.repository.localeCompare(b.machine.repository) ||
  a.machine.devcontainerPath.localeCompare(b.machine.devcontainerPath);

/** What the user is told when linked repositories define machines the project does not use. */
export const linkedMachinesNotice = (repositories: ReadonlyArray<string>) =>
  `Linked ${repositories.length === 1 ? "repository" : "repositories"} ${repositories.join(", ")} ` +
  `${repositories.length === 1 ? "defines a machine" : "define machines"} that this project does not use: ` +
  `a project's machine comes from its own repository, so its cloud sessions start plain.`;

export interface MachineSelection<S extends Source> {
  readonly discovery: ProjectMachineDiscovery;
  /** The project's own machine, or null (plain session). */
  readonly source: S | null;
  /** Linked repositories whose definitions were found and deliberately not used, sorted. */
  readonly ignoredRepositories: ReadonlyArray<string>;
}

export function selectProjectMachine<S extends Source>(input: {
  readonly sources: ReadonlyArray<S>;
  readonly rejected: ReadonlyArray<ProjectMachineRejectedCandidate>;
  readonly hints: ReadonlyArray<string>;
}): MachineSelection<S> {
  const sources = input.sources.toSorted(compareSources);
  const source = sources.find((entry) => entry.machine.repository === OWN_REPOSITORY) ?? null;
  const ignoredRepositories = [
    ...new Set(
      sources
        .map((entry) => entry.machine.repository)
        .filter((repository) => repository !== OWN_REPOSITORY),
    ),
  ];
  const hints =
    source === null && ignoredRepositories.length > 0
      ? [linkedMachinesNotice(ignoredRepositories), ...input.hints]
      : input.hints;
  return {
    discovery: {
      status:
        source === null
          ? { _tag: "None", ...(hints.length > 0 ? { reason: hints.join(" ") } : {}) }
          : { _tag: "Detected", definition: toDefinition(source) },
      candidates: sources.map(toDefinition),
      // A broken definition in a linked repository cannot block a project that does not use it.
      rejected: input.rejected.filter((entry) => entry.repository === OWN_REPOSITORY),
    },
    source,
    ignoredRepositories,
  };
}

const toDefinition = ({ machine: { files: _files, ...definition } }: Source) => definition;
