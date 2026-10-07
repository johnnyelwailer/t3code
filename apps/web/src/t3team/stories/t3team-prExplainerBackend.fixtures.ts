import type { T3TeamPrExplainer, T3TeamPrExplainerAskThread } from "@t3tools/contracts";

import { add, ctx, del } from "./t3team-prExplainerLine.fixtures";

/** The sample backend PR: "#412 Cache digest PR reads", with a flow map that morphs per step. */
export const backendExplainer: T3TeamPrExplainer = {
  version: 1,
  pullRequest: {
    number: 412,
    title: "Cache digest PR reads",
    url: "https://github.com/johnnyelwailer/t3code/pull/412",
  },
  headSha: "9f3c2a1e7d",
  generatedAt: "2026-10-07T08:12:00.000Z",
  summary:
    "The digest now reads PRs from a cache and refreshes in the background. Opens are instant.",
  risk: "low",
  reviewMinutes: 12,
  map: {
    nodes: [
      { id: "ui", label: "Digest UI", sublabel: "MyWorkDigest", role: "ui", col: 0, row: 0 },
      { id: "loader", label: "Loader", sublabel: "loadDigestPrs", role: "service", col: 1, row: 0 },
      { id: "github", label: "GitHub", sublabel: "listPrs", role: "external", col: 2, row: 0 },
      {
        id: "cache",
        label: "PR cache",
        sublabel: "per project",
        role: "store",
        col: 1,
        row: 1,
        since: "s2",
      },
      {
        id: "tests",
        label: "Tests",
        sublabel: "3 cases",
        role: "test",
        col: 0,
        row: 1,
        since: "s6",
      },
    ],
    edges: [
      { id: "ui-loader", from: "ui", to: "loader", label: "open" },
      { id: "loader-github", from: "loader", to: "github", label: "await", removedAt: "s3" },
      {
        id: "cache-github",
        from: "cache",
        to: "github",
        label: "refresh",
        style: "async",
        since: "s2",
      },
      { id: "loader-cache", from: "loader", to: "cache", label: "read", since: "s3" },
      { id: "tests-cache", from: "tests", to: "cache", label: "covers", since: "s6" },
    ],
  },
  steps: [
    {
      id: "s1",
      kind: "context",
      caption: "Before: every digest open waited for GitHub.",
      visual: { kind: "map", flow: ["ui-loader", "loader-github"] },
      touches: { nodes: ["github"], edges: ["loader-github"] },
      diffs: [
        {
          id: "s1-loader",
          path: "apps/web/src/mywork/digestLoader.ts",
          status: "modified",
          hunk: { oldStart: 14, oldLines: 6, newStart: 14, newLines: 6 },
          before: [
            ctx(14, 14, "export async function loadDigestPrs(project: ProjectRef) {"),
            ctx(15, 15, "  const github = githubFor(project);"),
          ],
          lines: [
            ctx(16, 16, "  const prs = await github.listPrs(project);", {
              info: "~1.8 s on every open",
            }),
            ctx(17, 17, "  return toDigestRows(prs);"),
          ],
          after: [ctx(18, 18, "}")],
        },
      ],
    },
    {
      id: "s2",
      kind: "change",
      caption: "A new cache keeps the last PR list per project.",
      visual: { kind: "map", flow: ["cache-github"] },
      touches: { nodes: ["cache"], edges: ["cache-github"] },
      diffs: [
        {
          id: "s2-cache",
          path: "apps/web/src/mywork/prCache.ts",
          status: "added",
          additions: 142,
          hunk: { oldStart: 0, oldLines: 0, newStart: 1, newLines: 142 },
          lines: [
            add(12, "export function createPrCache(store: KeyValueStore) {", {
              mark: ["createPrCache"],
            }),
            add(13, "  const inFlight = new Map<string, Promise<PrRow[]>>();", {
              mark: ["inFlight"],
            }),
            add(14, "  return { read, refresh };", { mark: ["read, refresh"] }),
          ],
          after: [add(15, "}"), add(16, ""), add(17, "function cacheKey(project: ProjectRef) {")],
        },
      ],
    },
    {
      id: "s3",
      kind: "change",
      caption: "The loader reads the cache, then refreshes in the background.",
      visual: { kind: "map", flow: ["ui-loader", "loader-cache", "cache-github"] },
      touches: { nodes: ["loader"], edges: ["loader-cache", "loader-github"] },
      diffs: [
        {
          id: "s3-loader",
          path: "apps/web/src/mywork/digestLoader.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          hunk: { oldStart: 14, oldLines: 5, newStart: 14, newLines: 6 },
          before: [
            ctx(14, 14, "export async function loadDigestPrs(project: ProjectRef) {"),
            ctx(15, 15, "  const github = githubFor(project);"),
          ],
          lines: [
            del(16, "  const prs = await github.listPrs(project);", {
              mark: ["await github.listPrs"],
            }),
            add(16, "  const prs = cache.read(project);", { mark: ["cache.read"] }),
            add(17, "  cache.refresh(project); // no await", {
              mark: ["cache.refresh", "// no await"],
            }),
          ],
          after: [ctx(17, 18, "  return toDigestRows(prs);"), ctx(18, 19, "}")],
        },
      ],
    },
    {
      id: "s4",
      kind: "change",
      caption: "The UI keeps chips visible and shows a small spinner.",
      visual: { kind: "map", flow: ["ui-loader"] },
      touches: { nodes: ["ui"], edges: ["ui-loader"] },
      diffs: [
        {
          id: "s4-view",
          path: "apps/web/src/mywork/MyWorkDigest.tsx",
          status: "modified",
          additions: 2,
          deletions: 1,
          hunk: { oldStart: 88, oldLines: 4, newStart: 88, newLines: 5 },
          before: [ctx(87, 87, "  return (")],
          lines: [
            del(88, "    {loading ? <Skeleton /> : <PrChips rows={rows} />}", {
              mark: ["loading ? <Skeleton /> :"],
            }),
            add(88, "    <PrChips rows={rows} />", { mark: ["<PrChips rows={rows} />"] }),
            add(89, '    {refreshing ? <Spinner size="xs" /> : null}', { mark: ["refreshing"] }),
          ],
          after: [ctx(89, 90, "  );")],
        },
      ],
    },
    {
      id: "s5",
      kind: "check",
      caption: "Check: the cache key has no viewer. Users could share rows.",
      visual: { kind: "map", warn: ["cache"] },
      touches: { nodes: ["cache"] },
      diffs: [
        {
          id: "s5-key",
          path: "apps/web/src/mywork/prCache.ts",
          status: "added",
          hunk: { oldStart: 0, oldLines: 0, newStart: 17, newLines: 4 },
          before: [add(16, "")],
          lines: [
            add(17, "function cacheKey(project: ProjectRef) {"),
            add(18, "  const key = `${host}/${repo}`;", {
              mark: ["`${host}/${repo}`"],
              warn: "add viewer id",
            }),
            add(19, "  return key;"),
          ],
          after: [add(20, "}")],
        },
      ],
    },
    {
      id: "s6",
      kind: "tests",
      caption: "Tests cover a stale hit, single-flight, and refresh failure.",
      visual: { kind: "map", flow: ["tests-cache"] },
      touches: { nodes: ["tests"], edges: ["tests-cache"] },
      diffs: [
        {
          id: "s6-tests",
          path: "apps/web/src/mywork/prCache.test.ts",
          status: "added",
          additions: 96,
          hunk: { oldStart: 0, oldLines: 0, newStart: 9, newLines: 3 },
          lines: [
            add(9, 'it("serves a stale hit, then refreshes", …)', { mark: ["stale hit"] }),
            add(31, 'it("joins one refresh per key (single-flight)", …)', {
              mark: ["single-flight"],
            }),
            add(58, 'it("keeps the old rows when refresh fails", …)', {
              mark: ["refresh fails"],
              info: "no UI test for the spinner",
            }),
          ],
        },
      ],
    },
  ],
};

/** A finished Q&A on the check step, and a second question whose answer is still coming in. */
export const backendThreads: ReadonlyArray<T3TeamPrExplainerAskThread> = [
  {
    id: "t1",
    anchor: {
      stepId: "s5",
      target: { kind: "diffLine", sliceId: "s5-key", start: 2, end: 2 },
      quote: "  const key = `${host}/${repo}`;",
    },
    messages: [
      { id: "m1", author: "reader", body: "Is this cache shared across viewers?", status: "done" },
      {
        id: "m2",
        author: "agent",
        body: "Yes. The store is per browser profile, but two accounts on one profile share keys. Add the viewer login to the key.",
        status: "done",
      },
    ],
  },
  {
    id: "t2",
    anchor: { stepId: "s5", target: { kind: "mapNode", nodeId: "cache" }, quote: "PR cache" },
    messages: [
      { id: "m3", author: "reader", body: "How long do rows stay in the cache?", status: "done" },
      {
        id: "m4",
        author: "agent",
        body: "Until the next refresh succeeds. There is no TTL, so a project you never open again",
        status: "streaming",
      },
    ],
  },
];
