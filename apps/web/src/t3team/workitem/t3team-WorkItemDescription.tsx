import type { ReactNode } from "react";

import {
  HtmlBlock,
  MarkdownBlock,
} from "~/t3team/components/ticket/t3team-ticketRichContentBlocks";
import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamAdfRenderer } from "~/t3team/workitem/adf/t3team-AdfRenderer";
import type { AdfDocument } from "~/t3team/workitem/adf/t3team-adfRendererTypes";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import { useInAppIssueLinks } from "~/t3team/workitem/t3team-useInAppIssueLinks";

/**
 * The description body.
 *
 * Rendering prefers ADF, which is Jira's own storage format and the only representation that
 * round-trips an edit without loss. `adfBody` is supplied by the caller so this component stays
 * independent of the renderer, and so Slice C can swap in the editor without touching the fallback
 * chain below it.
 *
 * The fallbacks exist for snapshots taken before ADF was captured, and for sites that only return
 * Jira's pre-rendered HTML. They are read-only by nature — editing a lossy projection would write
 * the loss back to Jira.
 */
export function WorkItemDescription({
  model,
  adfBody,
  htmlBaseUrl,
  resolveAssetUrl,
  onOpenIssue,
  onContextMenu,
  className,
}: {
  readonly model: WorkItemFieldModel;
  /** Overrides the rendered body. Slice C passes the editor through here. */
  readonly adfBody?: ReactNode;
  readonly htmlBaseUrl?: string | undefined;
  readonly resolveAssetUrl?: ((url: string) => string) | undefined;
  readonly onOpenIssue?: ((issueKey: string) => void) | undefined;
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  readonly className?: string;
}) {
  /*
    The ADF renderer routes issue links itself, but the HTML and markdown fallbacks emit plain
    anchors — so a link to a sibling issue used to leave the app. Intercepting at the container
    covers both fallbacks without rewriting their output.
  */
  const handleIssueLinkClick = useInAppIssueLinks(onOpenIssue);

  const body = resolveBody({
    model,
    adfBody,
    ...(htmlBaseUrl ? { htmlBaseUrl } : {}),
    ...(resolveAssetUrl ? { resolveAssetUrl } : {}),
    ...(onOpenIssue ? { onOpenIssue } : {}),
  });

  return (
    <div
      className={cn("min-w-0", className)}
      {...(onContextMenu ? { onContextMenu } : {})}
      {...(handleIssueLinkClick ? { onClick: handleIssueLinkClick } : {})}
    >
      {body ?? (
        // A single quiet line, not a card announcing that a card is empty.
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </div>
  );
}

function resolveBody({
  model,
  adfBody,
  htmlBaseUrl,
  resolveAssetUrl,
  onOpenIssue,
}: {
  readonly model: WorkItemFieldModel;
  readonly adfBody: ReactNode | undefined;
  readonly htmlBaseUrl?: string;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly onOpenIssue?: (issueKey: string) => void;
}): ReactNode {
  if (adfBody) return adfBody;

  // Preferred path: Jira's own format, rendered with our tokens and lossless for a later edit.
  if (model.descriptionAdf) {
    return (
      <T3TeamAdfRenderer
        doc={model.descriptionAdf as AdfDocument}
        {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
        {...(onOpenIssue ? { onOpenIssue } : {})}
      />
    );
  }

  if (model.descriptionHtml) {
    return (
      <HtmlBlock
        content={model.descriptionHtml}
        {...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {})}
        {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
      />
    );
  }

  const markdown = model.descriptionText?.trim();
  if (markdown && markdown.length > 0) {
    return <MarkdownBlock content={markdown} />;
  }

  return null;
}
