import { useMemo, type ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { ADF_BLOCK_STACK_CLASS, T3TeamAdfNodes } from "./t3team-adfNodeRegistry";
import {
  readAdfDocumentContent,
  type AdfDocument,
  type AdfRenderContext,
} from "./t3team-adfRendererTypes";

export type T3TeamAdfRendererProps = {
  /** A Jira ADF `doc` node. Malformed or empty documents render nothing. */
  readonly doc: AdfDocument | null | undefined;
  /** Rewrites Jira asset URLs to locally cached ones (`createJiraTicketAssetUrlResolver`). */
  readonly resolveAssetUrl?: ((url: string) => string) | undefined;
  /** Keeps Jira issue links in-app instead of opening a new tab. */
  readonly onOpenIssue?: ((issueKey: string) => void) | undefined;
  readonly className?: string | undefined;
};

/**
 * Renders Atlassian Document Format as React, styled with the app's own design tokens.
 * Pure: no effects, no state (collapsible content uses native `<details>`), and every node
 * type either renders or degrades to its readable text.
 */
export function T3TeamAdfRenderer({
  doc,
  resolveAssetUrl,
  onOpenIssue,
  className,
}: T3TeamAdfRendererProps): ReactNode {
  const ctx = useMemo<AdfRenderContext>(
    () => ({ resolveAssetUrl, onOpenIssue }),
    [resolveAssetUrl, onOpenIssue],
  );
  const nodes = useMemo(() => readAdfDocumentContent(doc), [doc]);

  if (nodes.length === 0) return null;

  return (
    <div
      className={cn(
        ADF_BLOCK_STACK_CLASS,
        "min-w-0 text-sm leading-6 text-foreground [overflow-wrap:anywhere]",
        className,
      )}
      data-adf-root="true"
    >
      <T3TeamAdfNodes nodes={nodes} ctx={ctx} depth={0} />
    </div>
  );
}
