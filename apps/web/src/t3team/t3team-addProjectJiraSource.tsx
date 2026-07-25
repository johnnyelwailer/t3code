/**
 * The Jira entry in the Add-project palette, and the fact that it comes FIRST.
 *
 * This distribution's projects are Jira work — the setup wizard's own steps are "Pick your style /
 * Connect Jira / Start working" — but the Add-project sources offered only Local folder, Git URL and
 * repository clones, so the primary way to add a project was missing from the primary affordance.
 *
 * Lives here rather than inline in `CommandPalette.tsx` so the upstream palette needs a single
 * prepend: the wording, icon, ordering and the wizard hand-off stay fork-owned.
 */

import { KanbanIcon } from "lucide-react";

import { requestT3TeamCreateProject } from "~/t3team/t3team-createProjectRequest";

export type T3TeamAddProjectPaletteItem = {
  readonly kind: "action";
  readonly value: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly keepOpen?: boolean;
  readonly run: () => Promise<void>;
};

/**
 * Builds the Jira source item. `closePalette` runs before the wizard is asked for, so the palette
 * is gone by the time the dialog mounts — two stacked overlays read as a glitch.
 */
export function buildT3TeamAddProjectJiraSource(input: {
  readonly environmentId: string;
  readonly iconClassName: string;
  readonly closePalette: () => void;
}): T3TeamAddProjectPaletteItem {
  return {
    kind: "action",
    value: `action:add-project:${input.environmentId}:t3team-jira`,
    searchTerms: ["jira", "atlassian", "ticket", "issue", "board", "backlog", "work"],
    title: "Jira project",
    description: "Connect an Atlassian site and pick a Jira project",
    icon: <KanbanIcon className={input.iconClassName} />,
    run: async () => {
      input.closePalette();
      requestT3TeamCreateProject();
    },
  };
}
