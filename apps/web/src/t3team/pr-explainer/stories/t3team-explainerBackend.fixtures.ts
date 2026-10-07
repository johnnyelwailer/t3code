import type { T3TeamExplainer, T3TeamExplainerAskThread } from "../model/t3team-explainer";
import { add, ctx, del } from "./t3team-explainerLine.fixtures";

const HEAD = "9f3c2a1e7d";

/** The sample backend PR: "#412 Cache digest PR reads", with a flow map that morphs per step. */
export const backendExplainer: T3TeamExplainer = {
  version: 2,
  subject: {
    kind: "pr",
    number: 412,
    title: "Cache digest PR reads",
    url: "https://github.com/johnnyelwailer/t3code/pull/412",
  },
  headSha: HEAD,
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
      { id: "cache-github", from: "cache", to: "github", label: "refresh", style: "async" },
      { id: "loader-cache", from: "loader", to: "cache", label: "read", since: "s3" },
      { id: "tests-cache", from: "tests", to: "cache", label: "covers" },
    ],
  },
  steps: [
    {
      id: "s1",
      kind: "context",
      label: "Before",
      caption: "Before: every digest open waited for GitHub.",
      blocks: [
        {
          id: "s1-map",
          type: "map",
          flow: ["ui-loader", "loader-github"],
          touches: { nodes: ["github"], edges: ["loader-github"] },
        },
        {
          id: "s1-loader",
          type: "diff",
          path: "apps/web/src/mywork/digestLoader.ts",
          status: "modified",
          newStart: 14,
          before: [
            ctx("export async function loadDigestPrs(project: ProjectRef) {"),
            ctx("  const github = githubFor(project);"),
          ],
          lines: [
            ctx("  const prs = await github.listPrs(project);", {
              mark: ["await github.listPrs"],
              info: "~1.8 s on every open",
            }),
            ctx("  return toDigestRows(prs);"),
          ],
          after: [ctx("}")],
        },
      ],
    },
    {
      id: "s2",
      kind: "change",
      label: "New cache",
      caption: "A new cache keeps the last PR list per project.",
      blocks: [
        { id: "s2-map", type: "map", flow: ["cache-github"], touches: { nodes: ["cache"] } },
        {
          id: "s2-cache",
          type: "diff",
          path: "apps/web/src/mywork/prCache.ts",
          status: "added",
          newStart: 12,
          stats: { additions: 142, deletions: 0 },
          lines: [
            add("export function createPrCache(store: KeyValueStore) {", {
              mark: ["createPrCache"],
            }),
            add("  const inFlight = new Map<string, Promise<PrRow[]>>();", { mark: ["inFlight"] }),
            add("  return { read, refresh };", { mark: ["read, refresh"] }),
          ],
          after: [add("}"), add(""), add("function cacheKey(project: ProjectRef) {")],
        },
      ],
    },
    {
      id: "s3",
      kind: "change",
      label: "Loader",
      caption: "The loader reads the cache, then refreshes in the background.",
      blocks: [
        {
          id: "s3-map",
          type: "map",
          flow: ["ui-loader", "loader-cache", "cache-github"],
          touches: { nodes: ["loader"], edges: ["loader-cache", "loader-github"] },
        },
        {
          id: "s3-loader",
          type: "diff",
          path: "apps/web/src/mywork/digestLoader.ts",
          status: "modified",
          newStart: 14,
          before: [
            ctx("export async function loadDigestPrs(project: ProjectRef) {"),
            ctx("  const github = githubFor(project);"),
          ],
          lines: [
            del("  const prs = await github.listPrs(project);", { mark: ["await github.listPrs"] }),
            add("  const prs = cache.read(project);", { mark: ["cache.read"] }),
            add("  cache.refresh(project); // no await", {
              mark: ["cache.refresh", "// no await"],
            }),
          ],
          after: [ctx("  return toDigestRows(prs);"), ctx("}")],
        },
      ],
    },
    {
      id: "s4",
      kind: "change",
      label: "UI",
      caption: "The UI keeps chips visible and shows a small spinner.",
      blocks: [
        { id: "s4-map", type: "map", flow: ["ui-loader"], touches: { nodes: ["ui"] } },
        {
          id: "s4-view",
          type: "diff",
          path: "apps/web/src/mywork/MyWorkDigest.tsx",
          status: "modified",
          newStart: 87,
          before: [ctx("  return (")],
          lines: [
            del("    {loading ? <Skeleton /> : <PrChips rows={rows} />}", {
              mark: ["loading ? <Skeleton /> :"],
            }),
            add("    <PrChips rows={rows} />", { mark: ["<PrChips rows={rows} />"] }),
            add('    {refreshing ? <Spinner size="xs" /> : null}', { mark: ["refreshing"] }),
          ],
          after: [ctx("  );")],
        },
      ],
    },
    {
      id: "s5",
      kind: "check",
      label: "Check",
      caption: "Check: the cache key has no viewer. Users could share rows.",
      blocks: [
        {
          id: "s5-risk",
          type: "callout",
          tone: "risk",
          text: "Two accounts on one browser profile would see each other's PR rows.",
        },
        { id: "s5-map", type: "map", warn: ["cache"], touches: { nodes: ["cache"] } },
        {
          id: "s5-key",
          type: "diff",
          path: "apps/web/src/mywork/prCache.ts",
          status: "added",
          newStart: 16,
          before: [add("")],
          lines: [
            add("function cacheKey(project: ProjectRef) {"),
            add("  const key = `${host}/${repo}`;", {
              mark: ["`${host}/${repo}`"],
              warn: "add viewer id",
            }),
            add("  return key;"),
          ],
          after: [add("}")],
        },
      ],
    },
    {
      id: "s6",
      kind: "tests",
      label: "Tests",
      caption: "Tests cover a stale hit, single-flight, and refresh failure.",
      blocks: [
        { id: "s6-map", type: "map", flow: ["tests-cache"], touches: { nodes: ["tests"] } },
        {
          id: "s6-tests",
          type: "diff",
          path: "apps/web/src/mywork/prCache.test.ts",
          status: "added",
          newStart: 9,
          stats: { additions: 96, deletions: 0 },
          lines: [
            add('it("serves a stale hit, then refreshes", …)', { mark: ["stale hit"] }),
            add('it("joins one refresh per key (single-flight)", …)', { mark: ["single-flight"] }),
            add('it("keeps the old rows when refresh fails", …)', {
              mark: ["refresh fails"],
              info: "no UI test for the spinner",
            }),
          ],
        },
        {
          id: "s6-verify",
          type: "checklist",
          style: "steps",
          title: "How to verify",
          detail: true,
          items: [
            { text: "Open My Work twice; the second open shows rows at once." },
            { text: "Go offline and reopen; the old rows stay." },
          ],
        },
      ],
    },
  ],
};

/**
 * Q&A on the check step: a finished thread on the key line, one still being answered, and two
 * outdated ones — asked on an older push, and on a step that no longer exists.
 */
export const backendThreads: ReadonlyArray<T3TeamExplainerAskThread> = [
  {
    id: "t1",
    headSha: HEAD,
    anchor: {
      stepId: "s5",
      target: { kind: "diffLines", blockId: "s5-key", start: 2, end: 3 },
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
    headSha: HEAD,
    anchor: {
      stepId: "s5",
      target: { kind: "mapNode", blockId: "s5-map", nodeId: "cache" },
      quote: "PR cache",
    },
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
  {
    id: "t3",
    headSha: "1d2e3f4a5b",
    anchor: { stepId: "s3", target: { kind: "caption" }, quote: "The loader reads the cache" },
    messages: [
      {
        id: "m5",
        author: "reader",
        body: "Does this still await GitHub anywhere?",
        status: "done",
      },
      { id: "m6", author: "agent", body: "Not after this push.", status: "done" },
    ],
  },
  {
    id: "t4",
    headSha: HEAD,
    anchor: { stepId: "s9", target: { kind: "caption" }, quote: "Feature flag" },
    messages: [{ id: "m7", author: "reader", body: "Is the flag still needed?", status: "done" }],
  },
];
