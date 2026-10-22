import type { Meta, StoryObj } from "@storybook/react";
import { useLayoutEffect, useState } from "react";

import { VoiceThreadRow } from "~/t3team/voice/surface/t3team-VoiceThreadRow";
import {
  IDLE_VOICE_UI,
  type VoiceUiSnapshot,
  type VoiceUiState,
} from "~/t3team/voice/surface/t3team-voiceUiModel";
import {
  IDLE_VOICE_LIVE,
  useVoiceUiStore,
  type VoiceUiLive,
} from "~/t3team/voice/surface/t3team-voiceUiStore";

/**
 * The real sidebar voice row in each state the session can be in, at the narrow, normal and wide
 * sidebar widths. The voice surfaces read one shared store, so a story seeds that store with the
 * snapshot the desktop recorder would publish.
 */
const WIDTHS = [200, 260, 340] as const;
const TITLE = "Voice thread #592";

function Seeded(props: {
  readonly state: VoiceUiState;
  readonly snapshot?: Partial<VoiceUiSnapshot>;
  readonly live?: Partial<VoiceUiLive>;
  readonly isActive: boolean;
}) {
  const [now] = useState(() => Date.now());
  useLayoutEffect(() => {
    useVoiceUiStore.setState({
      snapshot: {
        ...IDLE_VOICE_UI,
        state: props.state,
        startedAtMs: now - 14_000,
        ...props.snapshot,
      },
      live: { ...IDLE_VOICE_LIVE, ...props.live },
      controls: {
        toggle: () => undefined,
        dismiss: () => undefined,
        openMicrophoneSettings: () => undefined,
      },
    });
  });
  return (
    <div className="flex flex-col gap-3 bg-background p-4">
      {WIDTHS.map((width) => (
        <div key={width} style={{ width }}>
          <VoiceThreadRow
            title={TITLE}
            isActive={props.isActive}
            keys={["Ctrl", "Alt", "Space"]}
            onOpen={() => undefined}
          />
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "t3team/Voice/ThreadRow",
  component: Seeded,
  args: { state: "idle", isActive: false },
} satisfies Meta<typeof Seeded>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const IdleOpenThread: Story = { args: { isActive: true } };
export const Listening: Story = { args: { state: "recording" } };
export const ListeningWhileWriting: Story = {
  args: {
    state: "recording",
    live: { writing: 1, writingSinceMs: Date.now() - 4_000, level: 0.4 },
  },
};
export const ListeningAfterHeard: Story = {
  args: { state: "recording", live: { heard: { text: "open the board", atMs: Date.now() } } },
};
export const WritingAfterStop: Story = {
  args: { state: "transcribing", snapshot: { endedAtMs: Date.now() - 6_000 } },
};
export const Committed: Story = { args: { state: "committed", snapshot: { heardText: "hi" } } };
export const PreparingDownload: Story = {
  args: { state: "preparing", snapshot: { downloadPercent: 37 } },
};
export const PreparingNoProgress: Story = { args: { state: "preparing" } };
export const Failed: Story = { args: { state: "failed", snapshot: { failureDetail: null } } };
export const Denied: Story = { args: { state: "denied" } };
export const WarmingUp: Story = {
  args: { state: "recording", live: { warmup: { stage: "preparing-gpu", percent: 65 } } },
};
