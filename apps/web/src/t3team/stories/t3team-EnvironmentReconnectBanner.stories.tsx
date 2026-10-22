import type { Meta, StoryObj } from "@storybook/react";
import { LoaderCircleIcon, WifiOffIcon } from "lucide-react";

import { ComposerBannerStack } from "~/components/chat/ComposerBannerStack";
import { resolveEnvironmentUnavailableBannerCopy } from "~/components/t3team-environmentReconnectBanner";
import { Button } from "~/components/ui/button";

// The real copy helper and the real composer stack, wired the way ChatView wires them.
function EnvironmentBannerInComposer(props: {
  readonly label: string;
  readonly phase: "reconnecting" | "error";
  readonly isLocal: boolean;
}) {
  const copy = resolveEnvironmentUnavailableBannerCopy(props);
  return (
    <div className="mx-auto w-full max-w-3xl pt-16">
      <ComposerBannerStack
        items={[
          {
            id: `environment-unavailable:${props.label}`,
            variant: copy.variant,
            icon: copy.quiet ? <LoaderCircleIcon className="animate-spin" /> : <WifiOffIcon />,
            title: copy.title,
            actions: copy.showReconnect ? (
              <Button size="xs" variant="ghost">
                Reconnect
              </Button>
            ) : null,
          },
        ]}
      />
      <div className="rounded-b-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Ask anything…
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Composer/Environment Reconnect Banner",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** This PC's own backend is restarting (shown only after 30 s): quiet, no hostname. */
export const LocalRestarting: Story = {
  render: () => <EnvironmentBannerInComposer label="NX-GM17GBWE" phase="reconnecting" isLocal />,
};

/** The local backend failed hard: the only local state that warns. */
export const LocalNotResponding: Story = {
  render: () => <EnvironmentBannerInComposer label="NX-GM17GBWE" phase="error" isLocal />,
};

/** A remote server keeps the upstream wording and 2 s grace. */
export const RemoteReconnecting: Story = {
  render: () => (
    <EnvironmentBannerInComposer label="Build box" phase="reconnecting" isLocal={false} />
  ),
};
