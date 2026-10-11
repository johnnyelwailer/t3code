/**
 * The meta-arrange flow on the real My Work view: a pending draft (Keep / Discard bar) and an
 * agent-authored widget section rendered in its sandbox, beside a live arrangement.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  buildDigestPlan,
  type DigestGraph,
  type DigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DIGEST_FIXTURE_NOW_MS,
  HOUR,
  iesGraphWithoutSprint,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";

const ticketIds = iesGraphWithoutSprint.tickets.map((ticket) => ticket.id);

const COUNT_WIDGET = `<div style="font:600 28px/1.1 system-ui;color:var(--foreground)" id="n"></div>
<div style="font:12px system-ui;color:var(--muted-foreground)">open tickets in this view</div>
<script>
  const open = window.viewData.tickets.filter((t) => !/done/i.test(t.status)).length;
  document.getElementById("n").textContent = String(open);
</script>`;

const livePlan: DigestPlan = {
  producer: "agent",
  producedAt: new Date(DIGEST_FIXTURE_NOW_MS - 26 * HOUR).toISOString(),
  sections: [
    {
      id: "now",
      kind: "items",
      placement: "main",
      heading: "Do now",
      items: ticketIds.slice(0, 3).map((ticketId) => ({ ticketId })),
    },
  ],
};

const draftPlan: DigestPlan = {
  producer: "agent",
  producedAt: new Date(DIGEST_FIXTURE_NOW_MS - 3 * 60 * 1000).toISOString(),
  sections: [
    {
      id: "blockers",
      kind: "items",
      placement: "main",
      heading: "Release blockers first",
      hint: "You said release work matters most this week.",
      items: ticketIds.slice(0, 2).map((ticketId) => ({ ticketId, why: "on the release path" })),
    },
    {
      id: "count",
      kind: "widget",
      placement: "side",
      heading: "At a glance",
      items: [],
      widgetHtml: COUNT_WIDGET,
    },
    {
      id: "later",
      kind: "items",
      placement: "footer",
      heading: "Everything else",
      items: ticketIds.slice(2).map((ticketId) => ({ ticketId })),
    },
  ],
};

function DigestStory({ graph }: { readonly graph: DigestGraph }) {
  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <ProjectMyWorkDigestView
        plan={buildDigestPlan(graph, DIGEST_FIXTURE_NOW_MS)}
        graph={graph}
        nowMs={DIGEST_FIXTURE_NOW_MS}
        updatedAtMs={DIGEST_FIXTURE_NOW_MS - 2 * 60 * 1000}
        onPromoteDraft={async () => {}}
        onDiscardDraft={async () => {}}
        onResetArrangement={async () => {}}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Project Dashboard/My Work Digest — Arrange Draft",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** A draft is pending: the board shows it with Keep / Discard instead of the arrangement bar. */
export const PendingDraftWithWidget: Story = {
  render: () => (
    <DigestStory
      graph={{ ...iesGraphWithoutSprint, arrangement: livePlan, draftArrangement: draftPlan }}
    />
  ),
};

/** After Keep: the draft is the live arrangement, with its widget section. */
export const KeptArrangementWithWidget: Story = {
  render: () => <DigestStory graph={{ ...iesGraphWithoutSprint, arrangement: draftPlan }} />,
};

/** A widget that reaches the network is refused and shows a blocked note, not an iframe. */
export const BlockedWidget: Story = {
  render: () => (
    <DigestStory
      graph={{
        ...iesGraphWithoutSprint,
        arrangement: {
          ...draftPlan,
          sections: draftPlan.sections.map((section) =>
            section.kind === "widget"
              ? { ...section, widgetHtml: "<script>fetch('/api/x')</script>" }
              : section,
          ),
        },
      }}
    />
  ),
};
