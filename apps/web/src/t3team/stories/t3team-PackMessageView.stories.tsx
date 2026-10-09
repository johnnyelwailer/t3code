import type { Meta, StoryObj } from "@storybook/react";

import type { ChatMessage } from "~/types";
import { activateMessageViewPacks } from "~/t3team/chat/t3team-messageViewRegistry";
import { T3TeamSystemTimelineRow } from "~/t3team/chat/t3team-SystemTimelineRow";
import { decorateT3TeamTimelineEntries } from "~/t3team/chat/t3team-timelineArtifacts";
import {
  standupPackWebModule,
  standupShowViewArtifact,
} from "~/t3team/packs/t3team-standupPackFixtures";

// The fixture "standup" pack, activated as a distribution would activate it at boot.
activateMessageViewPacks([standupPackWebModule]);

/** The timeline row a workflow's `showView` produces: its artifact, joined as the timeline does. */
function showViewMessage(props: unknown): ChatMessage {
  const [entry] = decorateT3TeamTimelineEntries({
    entries: [],
    artifacts: [standupShowViewArtifact({ threadId: "thread-story", key: "standup:mon", props })],
    contextByMessageId: new Map(),
  });
  if (entry?.kind !== "message") throw new Error("showView artifact did not become a message row");
  return entry.message;
}

const meta = {
  title: "T3Team/Packs/Message View",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A pack view posted by `getThread()?.showView({ viewId: "standup.notes", … })`, rendered by the
 * pack's own component through the view registry. This host has no pack store yet, so the view
 * shows its no-store state.
 */
export const ShowViewArtifact: Story = {
  render: () => (
    <div className="max-w-3xl">
      <T3TeamSystemTimelineRow
        message={showViewMessage({
          day: "Mon",
          notes: [
            "Shipped the view registry",
            "Pairing on the pack store after lunch",
            "Blocked: **none**",
          ],
        })}
        threadRef={null}
        activeWorkflowInputMessageId={null}
      />
    </div>
  ),
};

/** Props the view's schema rejects never reach the pack: the generic attachment row shows. */
export const PropsThatDoNotDecode: Story = {
  render: () => (
    <div className="max-w-3xl">
      <T3TeamSystemTimelineRow
        message={showViewMessage({ day: 3 })}
        threadRef={null}
        activeWorkflowInputMessageId={null}
      />
    </div>
  ),
};
