import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { requestT3TeamCreateProject } from "~/t3team/t3team-createProjectRequest";

import { ProjectFavicon } from "../ProjectFavicon";
import { ADD_PILL_CLICK_BEHAVIOR } from "./t3team-sidebarProjectScopePills.logic";

/** Shared by the discs and the picker, so an add entry behaves the same wherever it is clicked. */
const ADD_DISABLED_REASON = "Not in the app yet. Add it from the Add project menu.";
export const addDisabledReason =
  ADD_PILL_CLICK_BEHAVIOR === "disabled" ? ADD_DISABLED_REASON : undefined;

export function addJiraProject(entry: JiraCatalogProject) {
  requestT3TeamCreateProject({
    accountId: entry.accountId,
    externalProjectId: entry.externalProjectId,
  });
}

export function GroupIcon({ group }: { group: SidebarProjectSnapshot }) {
  return <ProjectFavicon project={group} className="size-4 shrink-0" />;
}
