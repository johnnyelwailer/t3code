/**
 * "Universal" means every surface that renders a pull request identity mounts the one indicator
 * (doc 07 §4). This guard fails when a mount disappears, and when a new file starts rendering a
 * pull request through one of the known row primitives without mounting it. A surface that
 * truly must not carry the eye goes into `EXEMPT`, with its reason.
 */
import { describe, expect, it } from "vite-plus/test";

/** Every component source under apps/web/src, keyed by its path relative to that directory. */
const SOURCES: ReadonlyMap<string, string> = new Map(
  Object.entries(
    import.meta.glob<string>("/src/**/*.tsx", { query: "?raw", import: "default", eager: true }),
  )
    .filter(([path]) => !/\.(test|stories)\.tsx$/.test(path) && !path.includes("/stories/"))
    .map(([path, source]) => [path.replace(/^\/src\//, ""), source]),
);

function sourceOf(file: string): string {
  const source = SOURCES.get(file);
  if (source === undefined) throw new Error(`Not a component source: ${file}`);
  return source;
}

/** The surfaces doc 07 §4 lists, relative to apps/web/src. */
const REQUIRED_MOUNTS = [
  "components/Sidebar.tsx",
  "components/pullRequest/ThreadPullRequestsPanel.tsx",
  "components/chat/ThreadDetailsPrRow.tsx",
  "components/pullRequest/PullRequestRow.tsx",
  "components/pullRequest/PullRequestDetailPanel.tsx",
  "components/pullRequest/PullRequestLinkPreview.tsx",
  "t3team/t3team-ProjectMyWorkDigestPrChips.tsx",
  "t3team/t3team-ProjectMyWorkPrChips.tsx",
  "t3team/t3team-ProjectMyWorkDigestReviewSection.tsx",
  "t3team/t3team-GitHubActivitySection.tsx",
];

/**
 * Rendering one of these means drawing a pull request identity: the row-lines primitive, the
 * mini-list item, or the lifecycle row glyph beside a number. `DigestPrChip`, `ProjectMyWorkPrChip`
 * and `PullRequestLinkPreview` mount the indicator inside themselves, so their callers need
 * nothing. (The bare `PullRequestGlyph` icons also decorate filters, settings and empty states,
 * so they are not a marker.)
 */
const PR_RENDERING_MARKERS = [
  "<PullRequestRowLines",
  "<ThreadPullRequestMiniListItem",
  "<PullRequestRowGlyph",
];
const MOUNT = /<WatchedPullRequestIndicator\b/;

/** Files that render a marker without mounting the indicator, and why that is right. */
const EXEMPT = new Map<string, string>([
  ["components/ThreadStatusIndicators.tsx", "upstream mini list: its eye is the stop button (doc 07 §3.3)"],
]);

describe("watched pull request indicator mounts", () => {
  it("is mounted on every surface doc 07 §4 lists", () => {
    const missing = REQUIRED_MOUNTS.filter((file) => !MOUNT.test(sourceOf(file)));
    expect(missing).toEqual([]);
  });

  it("is mounted wherever a pull request row primitive is rendered", () => {
    const offenders = [...SOURCES].flatMap(([file, source]) => {
      if (EXEMPT.has(file)) return [];
      const rendersPullRequest = PR_RENDERING_MARKERS.some((marker) => source.includes(marker));
      return rendersPullRequest && !MOUNT.test(source) ? [file] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the exemption list honest", () => {
    const stale = [...EXEMPT.keys()].filter(
      (file) => !PR_RENDERING_MARKERS.some((marker) => sourceOf(file).includes(marker)),
    );
    expect(stale).toEqual([]);
  });
});
