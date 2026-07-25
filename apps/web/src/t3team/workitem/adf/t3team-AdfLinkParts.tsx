import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { ADF_TONE_CHIP_CLASSES } from "./t3team-adfColorTokens";
import { adfLinkDisplayText, jiraIssueKeyFromUrl, safeAdfHref } from "./t3team-adfLinkTargets";
import type { AdfRenderContext } from "./t3team-adfRendererTypes";

export const ADF_LINK_CLASS = "text-info-foreground underline underline-offset-2";

const ADF_CHIP_CLASS =
  "inline-flex max-w-full items-baseline gap-1 rounded-md border px-1.5 py-px align-baseline text-xs font-medium no-underline hover:brightness-105";

/**
 * Anchor for ADF `link` marks. Unsafe protocols were already stripped by `safeAdfHref`,
 * so a missing href means "render the text, not a link". Jira issue targets are handed to
 * `onOpenIssue` when the host provides it so navigation stays in-app.
 */
export function T3TeamAdfLink({
  href,
  ctx,
  className,
  title,
  unstyled = false,
  children,
}: {
  readonly href: string | undefined;
  readonly ctx: AdfRenderContext;
  readonly className?: string;
  readonly title?: string | undefined;
  /** Skips the default link colour/underline so chip callers own their own look. */
  readonly unstyled?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const safeHref = safeAdfHref(href);
  if (safeHref === undefined) return <>{children}</>;

  const baseClass = unstyled ? undefined : ADF_LINK_CLASS;
  const issueKey = jiraIssueKeyFromUrl(safeHref);
  const openIssue = ctx.onOpenIssue;
  if (issueKey !== undefined && openIssue !== undefined) {
    return (
      <button
        type="button"
        className={cn(baseClass, "cursor-pointer", className)}
        data-adf-issue-key={issueKey}
        title={title}
        onClick={() => openIssue(issueKey)}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      className={cn(baseClass, className)}
      title={title}
    >
      {children}
    </a>
  );
}

/**
 * Smart-link chip shared by `inlineCard`, `blockCard` and `embedCard`. We never embed remote
 * frames — an issue key (or a trimmed host/path) is both safer and denser than an iframe.
 */
export function T3TeamAdfCardChip({
  url,
  ctx,
  label,
  block = false,
}: {
  readonly url: string | undefined;
  readonly ctx: AdfRenderContext;
  readonly label?: string | undefined;
  readonly block?: boolean;
}): ReactNode {
  const safeHref = safeAdfHref(url);
  if (safeHref === undefined) {
    return label === undefined ? null : <span className="text-muted-foreground">{label}</span>;
  }
  const issueKey = jiraIssueKeyFromUrl(safeHref);
  const text = label ?? issueKey ?? adfLinkDisplayText(safeHref);
  const chip = (
    <T3TeamAdfLink
      href={safeHref}
      ctx={ctx}
      title={safeHref}
      unstyled
      className={cn(
        ADF_CHIP_CLASS,
        issueKey === undefined ? ADF_TONE_CHIP_CLASSES.muted : ADF_TONE_CHIP_CLASSES.info,
      )}
    >
      <span className="truncate">{text}</span>
    </T3TeamAdfLink>
  );
  return block ? <div>{chip}</div> : chip;
}
