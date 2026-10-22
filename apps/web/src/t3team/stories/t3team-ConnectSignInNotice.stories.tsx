import type { Meta, StoryObj } from "@storybook/react";
import type { EnvironmentConnectSignInAttempt } from "@t3tools/contracts";
import { useState } from "react";

import { getConnectSignInNoticeView } from "~/cloud/t3team-connectSignInNotice.logic";
import { ConnectSignInNoticeSettingRow } from "~/components/settings/t3team-ConnectSignInNoticeSetting";
import { ConnectSignInPillView } from "~/components/sidebar/t3team-ConnectSignInPillView";

const noop = () => {};

/**
 * The T3 Connect sign-in notice: a linked environment without the sign-in shows a small sidebar
 * pill. Nothing opens a browser until the user clicks it, a failed attempt is never retried on
 * its own, and the "T3 Connect sign-in reminder" setting turns the pill off.
 */
function NoticeStory() {
  const [enabled, setEnabled] = useState(true);
  const attempts: ReadonlyArray<EnvironmentConnectSignInAttempt> = [
    "idle",
    "in_progress",
    "failed",
  ];
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-background p-6">
      <div className="flex w-[260px] flex-col gap-2 rounded-xl bg-sidebar p-2">
        {attempts.map((attempt) => {
          const view = getConnectSignInNoticeView(
            { required: true, attempt },
            { enabled, dismissed: false },
          );
          return view ? (
            <ConnectSignInPillView
              key={attempt}
              view={view}
              busy={false}
              canStart
              onStart={noop}
              onDismiss={noop}
            />
          ) : null;
        })}
        {enabled ? null : (
          <p className="px-2 py-1 text-2xs text-muted-foreground">Reminder off: no notice.</p>
        )}
      </div>
      <div className="w-[560px] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm/4">
        <ConnectSignInNoticeSettingRow enabled={enabled} onEnabledChange={setEnabled} />
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Cloud/Connect Sign-in Notice",
  component: NoticeStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NoticeStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle (click to sign in), in progress, and failed (manual retry), with the setting row. */
export const States: Story = {};
