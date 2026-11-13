import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { type EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { adoptCloudCheckoutProjects } from "@t3tools/client-runtime/state/t3team-cloudCheckoutAdoption";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";

import { environmentCatalog } from "../connection/catalog";
import { environmentProjects } from "./projects";

/**
 * The projects as the app's project selectors offer them: a cloud session's checkout joins the
 * user's own project of the same repository (title and work-source binding), so the selectors
 * list the project once, under the user's name and icon. Only the view changes: every adopted
 * project keeps its environment and id, so a thread on the machine still opens its own project.
 */
export function createCloudAdoptionAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly projectsAtom: Atom.Atom<ReadonlyArray<EnvironmentProject>>;
}) {
  /** The environments the Nexi broker registered: the cloud session machines. */
  const cloudSessionEnvironmentIdsAtom = Atom.make((get) => {
    const ids = new Set<string>();
    for (const [environmentId, entry] of get(input.catalogValueAtom).entries) {
      if (entry.target._tag === "BrokerConnectionTarget") ids.add(String(environmentId));
    }
    return ids;
  }).pipe(Atom.withLabel("mobile:cloud-session-environment-ids"));

  const adoptedProjectsAtom = Atom.make((get): ReadonlyArray<EnvironmentProject> => {
    const projects = get(input.projectsAtom);
    const machines = get(cloudSessionEnvironmentIdsAtom);
    if (machines.size === 0) return projects;
    const isMachine = (environmentId: EnvironmentId) => machines.has(String(environmentId));
    return adoptCloudCheckoutProjects({
      projects,
      isOwnEnvironment: (environmentId) => !isMachine(environmentId),
      isCloudSessionEnvironment: isMachine,
    });
  }).pipe(Atom.withLabel("mobile:cloud-adopted-projects"));

  return { cloudSessionEnvironmentIdsAtom, adoptedProjectsAtom };
}

const { adoptedProjectsAtom } = createCloudAdoptionAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  projectsAtom: environmentProjects.projectsAtom,
});

/** The adopted list as an atom: for consumers that read projects outside hooks (list order atoms). */
export const cloudAdoptedProjectsAtom = adoptedProjectsAtom;

export function useCloudAdoptedProjects(): ReadonlyArray<EnvironmentProject> {
  return useAtomValue(adoptedProjectsAtom);
}
