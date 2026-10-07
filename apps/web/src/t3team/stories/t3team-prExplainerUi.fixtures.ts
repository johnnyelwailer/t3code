import type { T3TeamPrExplainer } from "@t3tools/contracts";

import { add, ctx, del, mockScreenshot } from "./t3team-prExplainerLine.fixtures";

const rows = [
  { label: "Fix OAuth callback", chip: "#398" },
  { label: "Cache digest PR reads", chip: "#412" },
  { label: "Rail overflow", chip: "#415" },
];

const before = mockScreenshot({
  title: "My Work",
  rows: rows.map((row) => ({ label: row.label })),
  accent: "#2563eb",
});
const after = mockScreenshot({ title: "My Work", rows, accent: "#2563eb", spinner: true });

/** A UI pull request: before/after screenshots beside the diff that makes the difference. */
export const uiExplainer: T3TeamPrExplainer = {
  version: 1,
  pullRequest: { number: 407, title: "PR chips stay visible while the digest refreshes" },
  headSha: "6965824c5b",
  generatedAt: "2026-10-06T16:40:00.000Z",
  summary: "Chips no longer blank out on refresh. A spinner shows the refresh instead.",
  risk: "low",
  reviewMinutes: 6,
  steps: [
    {
      id: "u1",
      kind: "change",
      caption: "Rows keep their PR chips. A spinner shows the refresh.",
      visual: {
        kind: "uiCompare",
        mode: "slider",
        before: { src: before, alt: "Digest rows with grey placeholder bars while loading" },
        after: { src: after, alt: "Digest rows with PR chips and a small spinner in the header" },
      },
      diffs: [
        {
          id: "u1-row",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestRow.tsx",
          status: "modified",
          additions: 1,
          deletions: 1,
          hunk: { oldStart: 41, oldLines: 3, newStart: 41, newLines: 3 },
          before: [ctx(40, 40, '  <div className="flex items-center gap-2">')],
          lines: [
            del(41, "    {loading ? <Bar /> : <PrChip pr={pr} />}", {
              mark: ["loading ? <Bar /> :"],
            }),
            add(41, "    <PrChip pr={pr} />"),
          ],
          after: [ctx(42, 42, "  </div>")],
        },
      ],
    },
    {
      id: "u2",
      kind: "change",
      caption: "Side by side: the header gains the spinner.",
      visual: {
        kind: "uiCompare",
        mode: "pair",
        before: { src: before, alt: "Header before: title only", caption: "Before" },
        after: { src: after, alt: "Header after: title and spinner", caption: "After" },
      },
      diffs: [
        {
          id: "u2-header",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestHeader.tsx",
          status: "modified",
          additions: 1,
          hunk: { oldStart: 18, oldLines: 2, newStart: 18, newLines: 3 },
          lines: [
            ctx(18, 18, "  <h2>My Work</h2>"),
            add(19, '  {refreshing ? <Spinner size="xs" tone="muted" /> : null}', {
              mark: ['<Spinner size="xs" tone="muted" />'],
            }),
          ],
        },
      ],
    },
    {
      id: "u3",
      kind: "check",
      caption: "Check: the spinner has no label for screen readers.",
      visual: { kind: "none" },
      diffs: [
        {
          id: "u3-a11y",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestHeader.tsx",
          status: "modified",
          hunk: { oldStart: 18, oldLines: 2, newStart: 18, newLines: 3 },
          lines: [
            add(19, '  {refreshing ? <Spinner size="xs" tone="muted" /> : null}', {
              warn: "add aria-label",
            }),
          ],
        },
      ],
    },
  ],
};
