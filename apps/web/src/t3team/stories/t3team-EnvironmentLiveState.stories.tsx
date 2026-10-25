import type { Meta, StoryObj } from "@storybook/react";
import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { useState } from "react";
import { CircleDashedIcon, ClockIcon } from "lucide-react";

import { resolveSessionEndingNotice } from "~/cloud/t3team-cloudSessionEnding";
import { ComposerBannerStack } from "~/components/chat/ComposerBannerStack";
import { endedSessionBannerItem } from "~/components/chat/t3team-CloudSessionEndedBanner";
import { CloudSessionEndedActionsView } from "~/components/cloud/t3team-CloudSessionEndedActions";
import {
  resolveLiveStateSidebarOverride,
  type EnvironmentLiveState,
} from "~/cloud/t3team-environmentLiveState";
import { OfflineWorkingLabel } from "~/t3team/chat/t3team-offlineWorkingLabel";
import { WorkingLeadText } from "~/t3team/chat/t3team-workingLeadText";

const ENDED_ENVIRONMENT = EnvironmentId.make("env-ws");

/**
 * A thread whose environment is offline or whose cloud session ended must not keep claiming it is
 * working. These render the production pieces: `resolveLiveStateSidebarOverride` (the sidebar rule),
 * `OfflineWorkingLabel` and `WorkingLeadText` (the thread's working row).
 */

function SidebarStatus({ liveState }: { readonly liveState: EnvironmentLiveState }) {
  const override = resolveLiveStateSidebarOverride(liveState);
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium tabular-nums ${override?.className ?? "text-info"}`}
    >
      <CircleDashedIcon aria-hidden className="size-4" />
      <span>{override?.label ?? "Working"}</span>
      {override ? null : <span aria-hidden>16s</span>}
    </span>
  );
}

function ThreadWorkingRow({ liveState }: { readonly liveState: EnvironmentLiveState }) {
  const [startedAt] = useState(() => new Date(Date.now() - 15_000).toISOString());
  return (
    <div className="border-b border-border/60 px-1 pb-2 pt-1 text-sm text-muted-foreground tabular-nums">
      {liveState === "live" ? (
        <WorkingLeadText stateWord="Working" createdAt={startedAt} liveState shimmer />
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

/** The composer banner of an ended cloud session: the production item and the production
 *  ended-session action, driven by fixture controller state (the data seam the app's controller
 *  supplies). The action is `CloudSessionEndedActionsView` — the same module the app renders — so
 *  the restart wording, the state it offers, and its click target cannot drift from the app. */
function EndedBannerStory({
  sessions,
  createPending,
}: {
  readonly sessions: CloudSession[];
  readonly createPending: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl pt-16">
      <ComposerBannerStack
        items={[
          endedSessionBannerItem(
            ENDED_ENVIRONMENT,
            <CloudSessionEndedActionsView
              available
              sessions={sessions}
              environmentId={ENDED_ENVIRONMENT}
              createPending={createPending}
              onStart={() => {}}
              onConnect={() => {}}
            />,
          ),
        ]}
      />
      <div className="rounded-b-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Ask anything…
      </div>
    </div>
  );
}

/** The session ended and nothing is on its way: one click starts another in the same project. */
export const EndedSessionBanner: Story = {
  render: () => <EndedBannerStory sessions={[]} createPending={false} />,
};

/** A create is in flight: the button reads "Starting…" and stays inert until the list catches up. */
export const EndedSessionBannerStarting: Story = {
  render: () => <EndedBannerStory sessions={[]} createPending />,
};

/** A live session already serves the same environment: connect to it instead of starting another. */
export const EndedSessionBannerConnect: Story = {
  render: () => (
    <EndedBannerStory
      sessions={[
        {
          sessionId: "9",
          providerKind: "github_actions",
          phase: "ready",
          environmentId: "env-ws",
          elapsedSeconds: 155,
          remainingSeconds: 4 * 3600 - 155,
          machineLabel: "ubuntu-slim · 12 GB · 4 cores",
          failureReason: null,
          detailsUrl: null,
        },
      ]}
      createPending={false}
    />
  ),
};

/** Fifteen minutes or less of the session's hold left: the end is announced, not a surprise. */
export const SessionEndingBanner: Story = {
  render: () => {
    const notice = resolveSessionEndingNotice(14 * 60);
    return (
      <div className="mx-auto w-full max-w-3xl pt-16">
        <ComposerBannerStack
          items={[
            {
              id: "cloud-session-ending:story",
              variant: "warning",
              priority: "notice",
              icon: <ClockIcon aria-hidden="true" />,
              title: notice?.title ?? "",
              description: notice?.description,
              dismissLabel: "Dismiss session ending notice",
              onDismiss: () => {},
            },
          ]}
        />
        <div className="rounded-b-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Ask anything…
        </div>
      </div>
    );
  },
};
