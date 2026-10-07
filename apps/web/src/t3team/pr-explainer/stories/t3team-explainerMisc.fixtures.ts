import type { T3TeamExplainer, T3TeamExplainerStep } from "../model/t3team-explainer";
import { add, ctx, del } from "./t3team-explainerLine.fixtures";

/** A trivial pull request: two diff-only steps. */
export const trivialExplainer: T3TeamExplainer = {
  version: 2,
  subject: { kind: "pr", number: 421, title: "Fix typo in the review toast" },
  headSha: "4314903596",
  generatedAt: "2026-10-07T09:00:00.000Z",
  summary: "One word fixed in a toast. One test string updated.",
  risk: "low",
  reviewMinutes: 1,
  steps: [
    {
      id: "t1",
      kind: "change",
      label: "Toast",
      caption: "The toast says “review”, not “reveiw”.",
      blocks: [
        {
          id: "t1-toast",
          type: "diff",
          path: "apps/web/src/components/pullRequest/reviewToast.ts",
          status: "modified",
          newStart: 12,
          lines: [
            del('  title: "Reveiw sent",', { mark: ["Reveiw"] }),
            add('  title: "Review sent",', { mark: ["Review"] }),
          ],
        },
      ],
    },
    {
      id: "t2",
      kind: "tests",
      caption: "The test expects the new spelling.",
      blocks: [
        {
          id: "t2-test",
          type: "diff",
          path: "apps/web/src/components/pullRequest/reviewToast.test.ts",
          status: "modified",
          newStart: 20,
          lines: [
            del('  expect(toast.title).toBe("Reveiw sent");', { mark: ["Reveiw"] }),
            add('  expect(toast.title).toBe("Review sent");', { mark: ["Review"] }),
          ],
        },
      ],
    },
  ],
};

const AREAS = ["router", "auth", "projects", "threads", "settings", "inbox", "kanban", "backlog"];
const LABEL = (area: string) => `${area[0]!.toUpperCase()}${area.slice(1)}`;

function largeStep(index: number, count: number): T3TeamExplainerStep {
  const area = AREAS[index % AREAS.length]!;
  const kind =
    index === 0 ? "context" : index === count - 1 ? "tests" : index % 5 === 4 ? "check" : "change";
  const nodes = [`n${index % 4}`];
  return {
    id: `l${index + 1}`,
    kind,
    label: kind === "check" ? `Check ${area}` : kind === "tests" ? "Tests" : LABEL(area),
    caption:
      kind === "check"
        ? `Check: ${area} now throws on a missing id.`
        : `The ${area} module uses the shared route helper.`,
    blocks: [
      {
        id: `l${index + 1}-map`,
        type: "map",
        flow: [`e${index % 3}`],
        touches: { nodes },
        ...(kind === "check" ? { warn: nodes } : {}),
      },
      {
        id: `l${index + 1}-d`,
        type: "diff",
        path: `apps/web/src/${area}/routes.ts`,
        status: "modified",
        newStart: 9,
        lines: [
          ctx(`export const ${area}Routes = [`),
          del(`  route("/${area}/:id", load${index}),`, { mark: [`route("/${area}/:id"`] }),
          add(`  sharedRoute("${area}", load${index}),`, {
            mark: [`sharedRoute("${area}"`],
            ...(kind === "check" ? { warn: "throws if id is missing" } : {}),
          }),
        ],
      },
    ],
  };
}

function routeExplainer(count: number, number: number): T3TeamExplainer {
  return {
    version: 2,
    subject: { kind: "pr", number, title: "Move every route to the shared route helper" },
    headSha: "b6b9bfb1ed",
    generatedAt: "2026-10-07T09:30:00.000Z",
    summary: `${count} modules move to one route helper. Some now throw on bad ids.`,
    risk: "high",
    reviewMinutes: Math.round(count * 3),
    map: {
      nodes: [
        { id: "n0", label: "Router", role: "service", col: 0, row: 0 },
        { id: "n1", label: "Route helper", role: "service", col: 1, row: 0, since: "l2" },
        { id: "n2", label: "Loaders", role: "service", col: 2, row: 0 },
        { id: "n3", label: "Error page", role: "ui", col: 1, row: 1 },
      ],
      edges: [
        { id: "e0", from: "n0", to: "n1", label: "build" },
        { id: "e1", from: "n1", to: "n2", label: "load" },
        { id: "e2", from: "n1", to: "n3", label: "throw", since: "l5" },
        { id: "eOld", from: "n0", to: "n2", label: "direct", removedAt: "l2" },
      ],
    },
    steps: Array.from({ length: count }, (_, index) => largeStep(index, count)),
  };
}

/** A large pull request: 14 steps. */
export const largeExplainer = routeExplainer(14, 430);

/** The rail at its limit: 40 steps in a 420px panel. */
export const hugeExplainer = routeExplainer(40, 431);
