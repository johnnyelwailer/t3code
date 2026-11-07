import type { ScopedThreadRef } from "@t3tools/contracts";
import { memo } from "react";

import type { RightPanelSurface } from "~/rightPanelStore";
import { DigestTicketChatProvider } from "~/t3team/t3team-digestTicketChatContext";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import { usePublishViewContext } from "~/t3team/t3team-usePublishThreadViewContext";
import { useViewTabProject } from "~/t3team/t3team-useViewTabProject";
import { buildViewTabContext } from "~/t3team/t3team-viewContextBuild";
import { useViewContextStore } from "~/t3team/t3team-viewContextStore";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";
import { MyWorkViewTab, ViewTabMessage, WorkItemViewTab } from "~/t3team/t3team-ViewSurfaceBodies";

type ViewSurface = Extract<RightPanelSurface, { kind: "view" }>;

/** While the tab shows, the thread's agent reads it through `t3_current_view`. */
function usePublishViewTabContext(threadId: string, target: T3TeamViewTarget, visible: boolean) {
  const items = useViewContextStore((state) =>
    target.kind === "my-work" && state.items?.projectId === target.projectId ? state.items : null,
  );
  usePublishViewContext(threadId, visible ? buildViewTabContext({ target, items }) : null);
}

/**
 * A Team view as a right-panel tab: My Work or one work item, rendered by the same components the
 * dashboard uses. A ticket's own chat stays off here; the thread beside it is the chat.
 */
function ViewSurfaceContent(props: {
  readonly threadRef: ScopedThreadRef;
  readonly surface: ViewSurface;
  readonly visible: boolean;
}) {
  const { threadRef, surface, visible } = props;
  const { target } = surface;
  const project = useViewTabProject(target.projectId);
  usePublishViewTabContext(threadRef.threadId, target, visible);
  if (project.status === "loading") {
    return (
      <div className="p-3">
        <ProjectMyWorkLoadingState />
      </div>
    );
  }
  if (project.status === "unknown") {
    return <ViewTabMessage>This project is not connected to a work source here.</ViewTabMessage>;
  }
  return (
    <DigestTicketChatProvider value={null}>
      {target.kind === "my-work" ? (
        <MyWorkViewTab threadRef={threadRef} project={project.project} />
      ) : (
        <WorkItemViewTab
          threadRef={threadRef}
          surfaceId={surface.id}
          target={target}
          project={project.project}
        />
      )}
    </DigestTicketChatProvider>
  );
}

export default memo(ViewSurfaceContent);
