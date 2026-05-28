import type { ReactNode } from "react";

import { TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import type { ProjectTicket } from "~/t3work/t3work-types";

const RECIPE_ACTION_PREVIEW_PROJECT_ID = "recipe-action-preview";
const RECIPE_ACTION_PREVIEW_UPDATED_AT = "1970-01-01T00:00:00.000Z";

function buildRecipeActionPreviewTicket(props: {
  readonly displayId: string;
  readonly title?: ReactNode;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly status?: string;
  readonly priority?: string;
}): ProjectTicket {
  const fallbackTitle =
    typeof props.title === "string" && props.title.trim().length > 0
      ? props.title
      : props.displayId;

  return {
    id: props.displayId,
    projectId: RECIPE_ACTION_PREVIEW_PROJECT_ID,
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: props.displayId,
      displayId: props.displayId,
      title: fallbackTitle,
      ...(props.issueTypeIconUrl ? { issueTypeIconUrl: props.issueTypeIconUrl } : {}),
      url: "#",
      projectId: RECIPE_ACTION_PREVIEW_PROJECT_ID,
    },
    ...(props.issueType ? { issueType: props.issueType } : {}),
    ...(props.issueTypeIconUrl ? { issueTypeIconUrl: props.issueTypeIconUrl } : {}),
    status: props.status ?? "",
    ...(props.priority ? { priority: props.priority } : {}),
    updatedAt: RECIPE_ACTION_PREVIEW_UPDATED_AT,
  };
}

export function RecipeActionIssuePreview(props: {
  readonly displayId: string;
  readonly title?: ReactNode;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly meta?: ReactNode;
}) {
  const previewTicket = buildRecipeActionPreviewTicket(props);

  return (
    <div className="w-full space-y-1">
      <TicketWorkItemRow ticket={previewTicket} onOpen={() => {}} />
      {props.meta ? (
        <div className="pl-6 text-xs leading-5 text-muted-foreground/80">{props.meta}</div>
      ) : null}
    </div>
  );
}
