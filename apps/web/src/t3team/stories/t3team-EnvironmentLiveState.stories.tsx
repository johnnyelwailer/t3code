import type { Meta, StoryObj } from "@storybook/react";
import { CircleDashedIcon, CloudOffIcon, WifiOffIcon } from "lucide-react";

import { ENDED_SESSION_BANNER_COPY } from "~/cloud/t3team-endedSessionAction";
import { ComposerBannerStack } from "~/components/chat/ComposerBannerStack";
import { Button } from "~/components/ui/button";
import {
  resolveLiveStateTopStatus,
  type EnvironmentLiveState,
} from "~/cloud/t3team-environmentLiveState";
import { OfflineWorkingLabel } from "~/t3team/chat/t3team-offlineWorkingLabel";
import { WorkingLeadText } from "~/t3team/chat/t3team-workingLeadText";

/**
 * A thread whose environment is offline or whose cloud session ended must not keep claiming it is
 * working. These render the production pieces: `resolveLiveStateTopStatus` (the sidebar rule),
 * `OfflineWorkingLabel` and `WorkingLeadText` (the thread's working row).
 */

function SidebarStatus({ liveState }: { readonly liveState: EnvironmentLiveState }) {
  const override = resolveLiveStateTopStatus(liveState, "working");
  return (
    <span
      title={override?.title}
      className={`inline-flex items-center gap-1 font-medium tabular-nums ${override?.className ?? "text-info"}`}
    >
      {override ? (
        <WifiOffIcon aria-hidden className="size-4" />
      ) : (
        <CircleDashedIcon aria-hidden className="size-4" />
      )}
      <span>{override?.label ?? "Working"}</span>
      {override ? null : <span aria-hidden>16s</span>}
    </span>
  );
}

function ThreadWorkingRow({ liveState }: { readonly liveState: EnvironmentLiveState }) {
  return (
    <div className="border-b border-border/60 px-1 pb-2 pt-1 text-sm text-muted-foreground tabular-nums">
      {liveState === "live" ? (
        <WorkingLeadText
          stateWord="Working"
          createdAt={new Date(Date.now() - 15_000).toISOString()}
          liveState
          shimmer
        />
      ) : (
        <OfflineWorkingLabel state={liveState} />
      )}
    </div>
  );
}

function Panel({ liveState }: { readonly liveState: EnvironmentLiveState }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>PONG</span>
        <SidebarStatus liveState={liveState} />
      </div>
      <ThreadWorkingRow liveState={liveState} />
    </div>
  );
}

const meta = {
  title: "T3Team/Cloud/Environment Live State",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Connected: the counters tick as before. */
export const Live: Story = { render: () => <Panel liveState="live" /> };

/** Reconnecting past the grace: frozen, no counters, resumes by itself. */
export const Offline: Story = { render: () => <Panel liveState="offline" /> };

/** The cloud session no longer exists: nothing is coming back. */
export const Ended: Story = { render: () => <Panel liveState="ended" /> };

/**
 * The composer banner of an ended cloud session, with the copy the app uses
 * (`ENDED_SESSION_BANNER_COPY`) and the stack it renders in. The real action is
 * `CloudSessionEndedActions`, which needs the session controller; this shows the idle state.
 */
export const EndedSessionBanner: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-3xl pt-16">
      <ComposerBannerStack
        items={[
          {
            id: "cloud-session-ended:story",
            variant: "warning",
            icon: <CloudOffIcon aria-hidden="true" />,
            title: ENDED_SESSION_BANNER_COPY.title,
            description: ENDED_SESSION_BANNER_COPY.description,
            actions: (
              <Button size="xs" variant="ghost">
                {ENDED_SESSION_BANNER_COPY.start}
              </Button>
            ),
          },
        ]}
      />
      <div className="rounded-b-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Ask anything…
      </div>
    </div>
  ),
};
