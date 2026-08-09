import { useCallback, type MouseEvent } from "react";

/** `/browse/PROJ-123`, the canonical shape of a Jira issue permalink. */
const BROWSE_PATH = /^\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/i;

export function readIssueKeyFromHref(href: string): string | undefined {
  try {
    const match = BROWSE_PATH.exec(new URL(href).pathname);
    return match?.[1]?.toUpperCase();
  } catch {
    return undefined;
  }
}

/**
 * Keeps links to other work items inside the app.
 *
 * Rich text reaches this view by two routes. The ADF renderer already recognises issue permalinks and
 * routes them through `onOpenIssue`, but content that falls back to Jira's pre-rendered HTML — older
 * cached comments, mostly — arrives as plain anchors, so a link to a sibling issue bounced the reader
 * out to a browser tab. Intercepting the click here covers that path without having to rewrite the
 * HTML before rendering it.
 *
 * Modified clicks are deliberately left alone: a reader who holds Cmd, Ctrl or Shift, or uses the
 * middle button, is asking for a new tab and should get one. Only a plain left click is redirected.
 */
export function useInAppIssueLinks(
  onOpenIssue: ((issueKey: string) => void) | undefined,
): ((event: MouseEvent<HTMLElement>) => void) | undefined {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!onOpenIssue) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href) return;

      const issueKey = readIssueKeyFromHref(href);
      if (!issueKey) return;

      event.preventDefault();
      onOpenIssue(issueKey);
    },
    [onOpenIssue],
  );

  return onOpenIssue ? handleClick : undefined;
}
