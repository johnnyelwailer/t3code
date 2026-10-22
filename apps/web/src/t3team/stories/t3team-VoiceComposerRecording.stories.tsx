import type { Meta, StoryObj } from "@storybook/react";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { useLayoutEffect, useState } from "react";

import { VoiceComposerDock } from "~/t3team/voice/t3team-VoiceComposerDock";
import { VoiceComposerInline } from "~/t3team/voice/t3team-VoiceComposerInline";
import { VoiceComposerMic } from "~/t3team/voice/t3team-VoiceComposerMic";
import { useVoiceThreadStore } from "~/t3team/voice/t3team-voiceThreadStore";
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
 * The voice thread's composer while it dictates: the real dock, inline partial and mic over a
 * stand-in composer surface (the full ChatComposer needs a live environment). Committed words are
 * already draft text; the utterance in progress trails it lighter; the mic is the one control.
 */
const ENV = "env-story";
const THREAD = "voice-thread-story";

function Seeded(props: {
  readonly state: VoiceUiState;
  readonly snapshot?: Partial<VoiceUiSnapshot>;
  readonly live?: Partial<VoiceUiLive>;
  /** What earlier utterances already put in the draft. */
  readonly draft?: string;
}) {
  const [now] = useState(() => Date.now());
  useLayoutEffect(() => {
    useVoiceThreadStore.setState({
      homeByEnvironmentId: {
        [ENV]: { threadId: ThreadId.make(THREAD), projectId: ProjectId.make("project-story") },
      },
    });
    useVoiceUiStore.setState({
      snapshot: {
        ...IDLE_VOICE_UI,
        state: props.state,
        startedAtMs: now - 8_300,
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
    <div className="flex w-[640px] flex-col bg-background p-6">
      <VoiceComposerDock environmentId={ENV} threadId={THREAD} />
      <div className="rounded-3xl border border-border bg-card px-4 pt-3 pb-2 shadow-xs">
        {props.draft ? (
          <div className="min-h-6 px-0.5 text-sm text-foreground">{props.draft}</div>
        ) : (
          <div className="min-h-6 px-0.5 text-sm text-placeholder">Message the voice thread…</div>
        )}
        <VoiceComposerInline environmentId={ENV} threadId={THREAD} onDictated={() => undefined} />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <VoiceComposerMic />
            Voice · Fast
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-primary/15">↑</span>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "t3team/Voice/ComposerRecording",
  component: Seeded,
  args: { state: "recording" },
} satisfies Meta<typeof Seeded>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Listening: Story = { args: { live: { level: 0.5 } } };
export const Streaming: Story = {
  args: {
    draft: "Open the voice thread.",
    live: { level: 0.7, partial: "And check whether the release" },
  },
};
export const WarmingUp: Story = {
  args: { live: { level: 0.4, warmup: { stage: "preparing-gpu", percent: 65 } } },
};
export const WritingDown: Story = {
  args: { draft: "Open the voice thread.", live: { level: 0.1, writing: 1 } },
};
export const Stopped: Story = {
  args: {
    state: "idle",
    draft: "Open the voice thread. And check whether the release branch is green.",
  },
};
