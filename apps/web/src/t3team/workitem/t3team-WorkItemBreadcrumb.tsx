/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { ChevronRight } from "lucide-react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import type { WorkItemParentRef } from "~/t3team/workitem/t3team-workItemFieldModel";

export type WorkItemBreadcrumbProps = {
  readonly projectTitle: string;
  readonly itemKey: string;
  readonly parent?: WorkItemParentRef | undefined;
  readonly onOpenProject?: (() => void) | undefined;
  readonly onOpenParent?: ((parentKey: string) => void) | undefined;
  readonly className?: string;
};

/**
 * Project › parent › key.
 *
 * The trail sheds segments as space runs out rather than truncating each one into ellipses: the
 * project name goes first, then the parent, leaving the key — the only segment that identifies
 * where you actually are — always readable. Native Jira truncates all three at once, which loses
 * the key on narrow windows.
 */
export function WorkItemBreadcrumb({
  projectTitle,
  itemKey,
  parent,
  onOpenProject,
  onOpenParent,
  className,
}: WorkItemBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)}
    >
      <Crumb
        label={projectTitle}
        {...(onOpenProject ? { onActivate: onOpenProject } : {})}
        className="hidden max-w-40 @xl/workitem-header:inline-flex"
      />
      <Separator className="hidden @xl/workitem-header:inline-flex" />

      {parent ? (
        <>
          <Crumb
            label={parent.summary ?? parent.key}
            title={parent.summary ? `${parent.key} — ${parent.summary}` : parent.key}
            {...(onOpenParent ? { onActivate: () => onOpenParent(parent.key) } : {})}
            {...(parent.issueType ? { issueType: parent.issueType } : {})}
            {...(parent.issueTypeIconUrl ? { issueTypeIconUrl: parent.issueTypeIconUrl } : {})}
            className="hidden max-w-48 @md/workitem-header:inline-flex"
          />
          <Separator className="hidden @md/workitem-header:inline-flex" />
        </>
      ) : null}

      <span className="shrink-0 font-medium tabular-nums text-foreground">{itemKey}</span>
    </nav>
  );
}

function Separator({ className }: { readonly className?: string }) {
  return (
    <ChevronRight aria-hidden="true" className={cn("size-3 shrink-0 opacity-50", className)} />
  );
}

function Crumb({
  label,
  title,
  issueType,
  issueTypeIconUrl,
  onActivate,
  className,
}: {
  readonly label: string;
  readonly title?: string;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly onActivate?: () => void;
  readonly className?: string;
}) {
  const content = (
    <>
      {issueType ? (
        <JiraIssueTypeIcon
          issueType={issueType}
          {...(issueTypeIconUrl ? { issueTypeIconUrl } : {})}
          className="size-3.5"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </>
  );

  const shared = cn("min-w-0 items-center gap-1.5", className);

  if (!onActivate) {
    return (
      <span className={shared} title={title ?? label}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      title={title ?? label}
      className={cn(
        shared,
        "rounded px-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
    >
      {content}
    </button>
  );
}
