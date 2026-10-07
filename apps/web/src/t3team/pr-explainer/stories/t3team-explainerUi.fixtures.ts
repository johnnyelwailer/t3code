import type { T3TeamExplainer } from "../model/t3team-explainer";
import { sampleClip, sampleClipPoster } from "./t3team-explainerClip.fixtures";
import { add, ctx, del, mockScreenshot } from "./t3team-explainerLine.fixtures";

const rows = [
  { label: "Fix OAuth callback", chip: "#398" },
  { label: "Cache digest PR reads", chip: "#412" },
  { label: "Rail overflow", chip: "#415" },
];

/**
 * The screenshots a host would hold as attachments. The story host resolves `attachment:<id>`
 * through this map, the way the app resolves a thread attachment.
 */
export const uiAttachments: Readonly<Record<string, string>> = {
  "digest-before": mockScreenshot({
    title: "My Work",
    rows: rows.map((row) => ({ label: row.label })),
    accent: "#2563eb",
  }),
  "digest-after": mockScreenshot({ title: "My Work", rows, accent: "#2563eb", spinner: true }),
};

/** A UI pull request: before/after screenshots, a screen recording, and the diff behind them. */
export const uiExplainer: T3TeamExplainer = {
  version: 2,
  subject: { kind: "pr", number: 407, title: "PR chips stay visible while the digest refreshes" },
  headSha: "6965824c5b",
  generatedAt: "2026-10-06T16:40:00.000Z",
  summary: "Chips no longer blank out on refresh. A spinner shows the refresh instead.",
  risk: "low",
  reviewMinutes: 6,
  steps: [
    {
      id: "u1",
      kind: "change",
      label: "Rows",
      caption: "Rows keep their PR chips. A spinner shows the refresh.",
      blocks: [
        {
          id: "u1-compare",
          type: "uiCompare",
          mode: "slider",
          before: {
            src: "attachment:digest-before",
            alt: "Digest rows with grey placeholder bars while loading",
          },
          after: {
            src: "attachment:digest-after",
            alt: "Digest rows with PR chips and a small spinner in the header",
          },
        },
        {
          id: "u1-row",
          type: "diff",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestRow.tsx",
          status: "modified",
          newStart: 40,
          before: [ctx('  <div className="flex items-center gap-2">')],
          lines: [
            del("    {loading ? <Bar /> : <PrChip pr={pr} />}", { mark: ["loading ? <Bar /> :"] }),
            add("    <PrChip pr={pr} />"),
          ],
          after: [ctx("  </div>")],
        },
      ],
    },
    {
      id: "u2",
      kind: "change",
      label: "Recording",
      caption: "Watch a refresh: the chips stay, the spinner turns once.",
      blocks: [
        {
          id: "u2-clip",
          type: "video",
          src: sampleClip,
          poster: sampleClipPoster,
          alt: "Screen recording: the digest refreshes; placeholder bars become PR chips",
          caption: "3 s, recorded on the PR branch",
        },
        {
          id: "u2-header",
          type: "diff",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestHeader.tsx",
          status: "modified",
          newStart: 18,
          lines: [
            ctx("  <h2>My Work</h2>"),
            add('  {refreshing ? <Spinner size="xs" tone="muted" /> : null}', {
              mark: ['<Spinner size="xs" tone="muted" />'],
            }),
          ],
        },
      ],
    },
    {
      id: "u3",
      kind: "change",
      label: "Side by side",
      caption: "Side by side: the header gains the spinner.",
      blocks: [
        {
          id: "u3-pair",
          type: "uiCompare",
          mode: "pair",
          before: { src: "attachment:digest-before", alt: "Header before: title only" },
          after: { src: "attachment:digest-after", alt: "Header after: title and spinner" },
        },
      ],
    },
    {
      id: "u4",
      kind: "check",
      label: "A11y",
      caption: "Check: the spinner has no label for screen readers.",
      blocks: [
        {
          id: "u4-warn",
          type: "callout",
          tone: "warn",
          text: "A screen reader announces nothing while the digest refreshes.",
        },
        {
          id: "u4-a11y",
          type: "diff",
          path: "apps/web/src/t3team/mywork-digest/t3team-DigestHeader.tsx",
          status: "modified",
          newStart: 19,
          lines: [
            add('  {refreshing ? <Spinner size="xs" tone="muted" /> : null}', {
              warn: "add aria-label",
            }),
          ],
        },
      ],
    },
  ],
};
