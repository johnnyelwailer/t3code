/**
 * The part of the pull-request detail panel's state that the route can carry in the URL:
 * which tab is open, and — on the Code tab — which file the diff explorer has focused.
 *
 * Keeping the URL in step with the panel is what makes "Copy link" and "Open in new tab"
 * honest: the link the reader copies is the page's own URL, so it must describe the view
 * that is actually on screen, not the one it replaced.
 */

export type PullRequestDetailTab = "summary" | "timeline" | "code";

export interface PullRequestDetailViewState {
  readonly tab: PullRequestDetailTab;
  /** The focused file's path on the Code tab; null anywhere else or before one is focused. */
  readonly file: string | null;
}

const DETAIL_TABS = ["summary", "timeline", "code"] as const;
/**
 * Long enough for any realistic path, short enough that a link stays a link: the value is
 * user-reachable through the address bar, so a hostile one must not be able to bloat it.
 */
const MAX_DETAIL_FILE_QUERY_LENGTH = 500;

/** The `tab` field of a search, or undefined when it names no tab this panel knows. */
export function pullRequestDetailTabFromSearch(raw: unknown): PullRequestDetailTab | undefined {
  if (typeof raw !== "string") return undefined;
  return (DETAIL_TABS as readonly string[]).includes(raw)
    ? (raw as PullRequestDetailTab)
    : undefined;
}

/** The `file` field of a search, trimmed and capped; undefined when it names no file. */
export function pullRequestDetailFileFromSearch(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value.slice(0, MAX_DETAIL_FILE_QUERY_LENGTH);
}

/** The `tab`/`file` fields a search should carry, normalized for `validateSearch`. */
export function pullRequestDetailViewStateSearchFields(raw: Readonly<Record<string, unknown>>): {
  readonly tab?: PullRequestDetailTab;
  readonly file?: string;
} {
  const tab = pullRequestDetailTabFromSearch(raw.tab);
  const file = pullRequestDetailFileFromSearch(raw.file);
  return {
    ...(tab !== undefined ? { tab } : {}),
    ...(file !== undefined ? { file } : {}),
  };
}

/**
 * What the route writes to the URL for a view: the default tab and a not-yet-focused file stay
 * out of the link, so an ordinary pull-request URL reads the way it always did.
 */
export function pullRequestDetailViewStateSearchPatch(view: PullRequestDetailViewState): {
  readonly tab?: PullRequestDetailTab;
  readonly file?: string;
} {
  return {
    ...(view.tab === "summary" ? {} : { tab: view.tab }),
    ...(view.file === null ? {} : { file: view.file }),
  };
}

/** Compares a search against a live view without treating an omitted default as a difference. */
export function pullRequestDetailViewStateMatches(
  search: { readonly tab?: unknown; readonly file?: unknown },
  view: PullRequestDetailViewState,
): boolean {
  const tab = pullRequestDetailTabFromSearch(search.tab) ?? "summary";
  const file = pullRequestDetailFileFromSearch(search.file) ?? null;
  return tab === view.tab && file === view.file;
}
