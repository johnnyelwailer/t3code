const CONFLUENCE_PAGE_TITLE_PATTERN = /^\/wiki\/spaces\/[^/]+\/pages\/\d+\/(.+)$/;

/** `Dateiablage+Organisation+Speicherort` -> `Dateiablage Organisation Speicherort`. */
function decodeConfluenceTitleSegment(segment: string): string | undefined {
  const spaced = segment.replace(/\+/g, " ");
  try {
    const decoded = decodeURIComponent(spaced).trim();
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    // A malformed percent-escape (e.g. a lone `%`) can't be decoded; the `+`-for-space swap
    // already happened, so falling back to that is still better than the raw slug.
    const trimmed = spaced.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

/** Short and human: hostname plus the last meaningful path segment — never the full URL. */
function fallbackLinkLabel(url: URL, path: string): string {
  const host = url.hostname === "placeholder.invalid" ? "" : url.hostname;
  const lastSegment = path.split("/").findLast((segment) => segment.length > 0);
  if (lastSegment === undefined) return host;
  return host.length > 0 ? `${host}/${lastSegment}` : lastSegment;
}

/**
 * Derives a human-readable label for a smart-link chip from the URL alone — we never fetch a
 * remote title. Confluence page links (`/wiki/spaces/<SPACE>/pages/<id>/<Title+With+Plus>`)
 * embed their title in the final path segment, which the editor URL-encodes; everything else
 * (space homes, attachments, dashboards, unparsable strings) falls back to a short host/last-
 * segment form. Jira issue keys are resolved by the caller via `jiraIssueKeyFromUrl` before this
 * ever runs, so this function never needs to special-case `/browse/`.
 */
export function adfSmartLinkLabel(href: string): string {
  try {
    const url = new URL(href, "https://placeholder.invalid");
    if (url.hostname === "placeholder.invalid" && !href.startsWith("/") && !href.startsWith("#")) {
      // Resolved only because of the fake base — this was never an absolute or root-relative
      // URL to begin with, so there is nothing meaningful to derive from it.
      return href;
    }
    const path = url.pathname.replace(/\/+$/, "");
    const pageMatch = CONFLUENCE_PAGE_TITLE_PATTERN.exec(path);
    const titleSegment = pageMatch?.[1];
    const title =
      titleSegment === undefined ? undefined : decodeConfluenceTitleSegment(titleSegment);
    return title ?? fallbackLinkLabel(url, path);
  } catch {
    return href;
  }
}
