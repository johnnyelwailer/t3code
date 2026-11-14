import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamSendConfirmationNotice } from "~/t3team/chat/t3team-SendConfirmationLine";

/**
 * The line under a sent message whose start-turn reply has not arrived: "Sending…" while
 * the connection is down, "Not confirmed" with Retry when it did not come back in time. A healthy
 * send shows nothing. Spec: nx-nexi nexi-work/send-confirmation.statechart/.
 */
const meta = {
  title: "T3Team/Chat/Send confirmation",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function SentMessage(props: { readonly text: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex w-[36rem] flex-col items-end gap-1">
      <div className="max-w-[80%] rounded-2xl bg-message px-3 py-2 text-sm text-message-foreground">
        {props.text}
      </div>
      {props.children}
    </div>
  );
}

export const SendingWhileOffline: Story = {
  render: () => (
    <SentMessage text="Bitte installiere die Abhängigkeiten, führe Build und Tests aus und eröffne danach einen Pull Request gegen main mit einer kurzen Zusammenfassung der Änderungen.">
      <T3TeamSendConfirmationNotice status="sending" online={false} onRetry={() => {}} />
    </SentMessage>
  ),
};

export const NotConfirmed: Story = {
  render: () => (
    <SentMessage text="Add slugify(input: string) to src/text.ts, export it from src/index.ts and add unit tests.">
      <T3TeamSendConfirmationNotice status="not-confirmed" online={false} onRetry={() => {}} />
    </SentMessage>
  ),
};

export const SendingWhileOnlineShowsNothing: Story = {
  render: () => (
    <SentMessage text="Reply with one word: pong.">
      <T3TeamSendConfirmationNotice status="sending" online onRetry={() => {}} />
    </SentMessage>
  ),
};
