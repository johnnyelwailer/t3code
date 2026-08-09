const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*-\d+$/;
const BROWSE_PATH_PATTERN = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/;

/**
 * Only protocols that cannot execute script are allowed through; anything else
 * (`javascript:`, `data:`, `vbscript:`, unknown app schemes) renders as plain text.
 */
export function safeAdfHref(href: string | undefined): string | undefined {
  const trimmed = href?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    return SAFE_PROTOCOLS.has(url.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** `https://site.atlassian.net/browse/ABC-12` -> `ABC-12`; also honours `?selectedIssue=`. */
export function jiraIssueKeyFromUrl(href: string | undefined): string | undefined {
  const safe = safeAdfHref(href);
  if (safe === undefined) return undefined;
  const browseMatch = BROWSE_PATH_PATTERN.exec(safe);
  const fromBrowse = browseMatch?.[1]?.toUpperCase();
  if (fromBrowse !== undefined && ISSUE_KEY_PATTERN.test(fromBrowse)) return fromBrowse;
  try {
    const selected = new URL(safe, "https://placeholder.invalid").searchParams
      .get("selectedIssue")
      ?.trim()
      .toUpperCase();
    if (selected !== undefined && ISSUE_KEY_PATTERN.test(selected)) return selected;
  } catch {
    return undefined;
  }
  return undefined;
}
