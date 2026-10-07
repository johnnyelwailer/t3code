import type { T3TeamPrExplainer, T3TeamPrExplainerStep } from "@t3tools/contracts";

import { add, ctx, del } from "./t3team-prExplainerLine.fixtures";

/** A trivial pull request: two diff-only steps, no visual. */
export const trivialExplainer: T3TeamPrExplainer = {
  version: 1,
  pullRequest: { number: 421, title: "Fix typo in the review toast" },
  headSha: "4314903596",
  generatedAt: "2026-10-07T09:00:00.000Z",
  summary: "One word fixed in a toast. One test string updated.",
  risk: "low",
  reviewMinutes: 1,
  steps: [
    {
      id: "t1",
      kind: "change",
      caption: "The toast says “review”, not “reveiw”.",
      visual: { kind: "none" },
      diffs: [
        {
          id: "t1-toast",
          path: "apps/web/src/components/pullRequest/reviewToast.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          hunk: { oldStart: 12, oldLines: 1, newStart: 12, newLines: 1 },
          lines: [
            del(12, '  title: "Reveiw sent",', { mark: ["Reveiw"] }),
            add(12, '  title: "Review sent",', { mark: ["Review"] }),
          ],
        },
      ],
    },
    {
      id: "t2",
      kind: "tests",
      caption: "The test expects the new spelling.",
      visual: { kind: "none" },
      diffs: [
        {
          id: "t2-test",
          path: "apps/web/src/components/pullRequest/reviewToast.test.ts",
          status: "modified",
          hunk: { oldStart: 20, oldLines: 1, newStart: 20, newLines: 1 },
          lines: [
            del(20, '  expect(toast.title).toBe("Reveiw sent");', { mark: ["Reveiw"] }),
            add(20, '  expect(toast.title).toBe("Review sent");', { mark: ["Review"] }),
          ],
        },
      ],
    },
  ],
};

const AREAS = ["router", "auth", "projects", "threads", "settings", "inbox", "kanban", "backlog"];

function largeStep(index: number): T3TeamPrExplainerStep {
  const area = AREAS[index % AREAS.length]!;
  const kind =
    index === 0 ? "context" : index === 13 ? "tests" : [4, 9].includes(index) ? "check" : "change";
  const nodes = [`n${index % 4}`];
  return {
    id: `l${index + 1}`,
    kind,
    caption:
      kind === "check"
        ? `Check: ${area} now throws on a missing id.`
        : `The ${area} module uses the shared route helper.`,
    visual: { kind: "map", flow: [`e${index % 3}`], ...(kind === "check" ? { warn: nodes } : {}) },
    touches: { nodes },
    diffs: [
      {
        id: `l${index + 1}-d`,
        path: `apps/web/src/${area}/routes.ts`,
        status: "modified",
        additions: 1,
        deletions: 1,
        hunk: { oldStart: 10, oldLines: 2, newStart: 10, newLines: 2 },
        lines: [
          ctx(9, 9, `export const ${area}Routes = [`),
          del(10, `  route("/${area}/:id", load${index}),`, { mark: [`route("/${area}/:id"`] }),
          add(10, `  sharedRoute("${area}", load${index}),`, {
            mark: [`sharedRoute("${area}"`],
            ...(kind === "check" ? { warn: "throws if id is missing" } : {}),
          }),
        ],
      },
    ],
  };
}

/** A large pull request: 14 steps, to test the rail at its widest. */
export const largeExplainer: T3TeamPrExplainer = {
  version: 1,
  pullRequest: { number: 430, title: "Move every route to the shared route helper" },
  headSha: "b6b9bfb1ed",
  generatedAt: "2026-10-07T09:30:00.000Z",
  summary: "Fourteen modules move to one route helper. Two now throw on bad ids.",
  risk: "high",
  reviewMinutes: 45,
  map: {
    nodes: [
      { id: "n0", label: "Router", role: "service", col: 0, row: 0 },
      { id: "n1", label: "Route helper", role: "service", col: 1, row: 0, since: "l2" },
      { id: "n2", label: "Loaders", role: "service", col: 2, row: 0 },
      { id: "n3", label: "Error page", role: "ui", col: 1, row: 1 },
    ],
    edges: [
      { id: "e0", from: "n0", to: "n1", label: "build", since: "l2" },
      { id: "e1", from: "n1", to: "n2", label: "load", since: "l2" },
      { id: "e2", from: "n1", to: "n3", label: "throw", since: "l5" },
      { id: "eOld", from: "n0", to: "n2", label: "direct", removedAt: "l2" },
    ],
  },
  steps: Array.from({ length: 14 }, (_, index) => largeStep(index)),
};
