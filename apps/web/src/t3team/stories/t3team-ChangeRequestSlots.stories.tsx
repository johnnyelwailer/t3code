import type { Meta, StoryObj } from "@storybook/react";
import type { PullRequestDetailView } from "@t3tools/contracts";
import { ProjectId } from "@t3tools/contracts";

import { activateAppViewPacks } from "~/t3team/packs/t3team-appViewRegistry";
import { ChangeRequestSummarySlot } from "~/t3team/packs/t3team-changeRequestSlots";
import {
  brokenPackWebModule,
  ciInsightsPackWebModule,
} from "~/t3team/packs/t3team-slotsPackFixtures";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { ProjectMyWorkDigestFixtureView } from "~/t3team/t3team-ProjectMyWorkDigestFixtureView";
import { agentArrangementScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

/**
 * The registry is one per page, so a story registers the fixture packs when it first renders: the
 * stories that do not (the other My Work digest stories) show the slots empty, which is the
 * layout every host sees until a pack registers a view.
 */
const meta = {
  title: "T3Team/Packs/Change Request Slots",
  decorators: [withT3TeamRouter],
  parameters: { layout: "padded" },
  loaders: [() => activateAppViewPacks([ciInsightsPackWebModule, brokenPackWebModule])],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const summaryDetail = {
  state: "open",
  headSha: "9fceb02",
  baseSha: "4a6d1c3",
  author: { login: "philip", name: null, avatarUrl: null },
  viewer: "philip",
} as unknown as PullRequestDetailView;

/**
 * `changeRequest.summary`: the card sits between the meta rows and the Description. The pack's
 * second view throws on render; it shows a one-line notice and the healthy card above it stays.
 */
export const SummaryCards: Story = {
  render: () => (
    <div className="max-w-xl">
      <ChangeRequestSummarySlot
        reference={{ projectId: ProjectId.make("project"), repository: "acme/app", number: 7 }}
        detail={summaryDetail}
      />
    </div>
  ),
};

/**
 * `myWork.changeRequest`: a badge beside each digest PR chip and beside each review row's actions,
 * never inside the chip's link. The throwing view is gone from the chip; the digest is intact.
 */
export const MyWorkBadges: Story = {
  render: () => (
    <ProjectMyWorkDigestFixtureView scenario={agentArrangementScenario} nowOffsetHours={0} />
  ),
  parameters: { layout: "fullscreen" },
};
