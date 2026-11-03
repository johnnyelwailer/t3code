import { ProjectFavicon } from "../components/ProjectFavicon";
import type { HomeProjectIconFacts } from "./t3team-extensionTypes";

/**
 * A project's own icon, drawn like the Chats rows draw it (its favicon, else its emoji or monogram),
 * for a slot that lists projects. The slot hands in the `icon` facts it was given.
 */
export function HomeProjectIcon(props: {
  readonly icon: HomeProjectIconFacts;
  readonly title: string;
  readonly size?: number;
}) {
  return (
    <ProjectFavicon
      environmentId={props.icon.environmentId}
      workspaceRoot={props.icon.workspaceRoot}
      faviconPath={props.icon.faviconPath}
      projectIcon={props.icon.projectIcon}
      projectTitle={props.title}
      size={props.size}
    />
  );
}
