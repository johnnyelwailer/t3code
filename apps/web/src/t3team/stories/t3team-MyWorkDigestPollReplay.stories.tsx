/**
 * The My Work digest across a realistic run of polls: cached paint, quiet ticks, one changed
 * ticket, a ticket moving lanes, Jira sync flipping, a first sync with nothing to show yet.
 * Watch it for flashing: only what actually changed should move.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { DigestPollReplay } from "./t3team-DigestPollReplay";
import {
  DIGEST_REPLAY_EMPTY_FIRST_STEPS,
  DIGEST_REPLAY_REFILL_STEPS,
  DIGEST_REPLAY_STEPS,
} from "./t3team-digestPollReplayScenario";

const meta = {
  title: "T3Team/Project Dashboard/My Work Digest — Poll Replay",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ColdStartThenPolls: Story = {
  render: () => <DigestPollReplay steps={DIGEST_REPLAY_STEPS} />,
};

export const CachedPaintThenPolls: Story = {
  render: () => <DigestPollReplay steps={DIGEST_REPLAY_STEPS} cachedPaint />,
};

export const EmptyFirstSyncThenPopulated: Story = {
  render: () => <DigestPollReplay steps={DIGEST_REPLAY_EMPTY_FIRST_STEPS} />,
};

export const MirrorRefillKeepsContent: Story = {
  render: () => <DigestPollReplay steps={DIGEST_REPLAY_REFILL_STEPS} />,
};
