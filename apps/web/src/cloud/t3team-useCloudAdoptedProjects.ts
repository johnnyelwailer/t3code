import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";

import { adoptCloudCheckoutProjects } from "./t3team-cloudCheckoutProjectAdoption";

/**
 * The projects as the sidebar, settings, command palette and new-thread picker group them: a cloud
 * session's checkout joins the user's own project of the same repository. Only environments
 * reached through the Nexi broker count: that is how the app starts a cloud session, and unlike a
 * relay machine it needs no session list to recognise.
 */
export function useCloudAdoptedProjects(
  projects: ReadonlyArray<EnvironmentProject>,
): ReadonlyArray<EnvironmentProject> {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { presentationById } = useEnvironments();
  return adoptCloudCheckoutProjects({
    projects,
    primaryEnvironmentId,
    isCloudSessionEnvironment: (environmentId) =>
      presentationById.get(environmentId)?.entry.target._tag === "BrokerConnectionTarget",
  });
}
