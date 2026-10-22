import type { Meta, StoryObj } from "@storybook/react";
import { MessageSquareIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { showContextMenuFallback } from "~/contextMenuFallback";
import { cn } from "~/lib/utils";
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
import { VOICE_ROW_MENU } from "~/t3team/voice/t3team-useVoiceRowMenu";

/**
 * The voice row where it lives: in the sidebar, between ordinary thread rows. The thread rows here
 * use SidebarThreadRow's own surface classes (that component is internal to Sidebar.tsx), so the
 * comparison is like for like: the voice row should differ only in its content.
 */
const rowSurface = (active: boolean) =>
  cn(
    "group/sidebar-row relative flex h-9 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-left outline-none select-none",
    active
      ? "bg-sidebar-row-active text-sidebar-foreground"
      : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
  );

function ThreadRowLike({ title, active = false }: { title: string; active?: boolean }) {
  return (
    <div className={rowSurface(active)}>
      <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="text-xs text-muted-foreground tabular-nums">2h</span>
    </div>
  );
}

const openMenu = (position: { x: number; y: number }) =>
  void showContextMenuFallback(VOICE_ROW_MENU, position);

function InSidebar(props: {
  readonly state: VoiceUiState;
  readonly snapshot?: Partial<VoiceUiSnapshot>;
  readonly live?: Partial<VoiceUiLive>;
  readonly isActive: boolean;
  readonly openMenu?: boolean;
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
  useEffect(() => {
    if (props.openMenu) setTimeout(() => openMenu({ x: 150, y: 70 }), 300);
  }, [props.openMenu]);
  return (
    <div className="min-h-[220px] bg-background p-4">
      <div className="flex w-[260px] flex-col gap-px rounded-lg bg-sidebar p-2 text-sidebar-foreground">
        <ThreadRowLike title="Fix login redirect" />
        <VoiceThreadRow
          title="Voice"
          isActive={props.isActive}
          keys={["Ctrl", "Alt", "Space"]}
          onOpen={() => undefined}
          onContextMenu={openMenu}
        />
        <ThreadRowLike title="Digest review lane" active={!props.isActive} />
        <ThreadRowLike title="Sprint planning notes" />
      </div>
    </div>
  );
}

const meta = {
  title: "t3team/Voice/ThreadRow in sidebar",
  component: InSidebar,
  args: { state: "idle", isActive: false },
} satisfies Meta<typeof InSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const IdleOpenThread: Story = { args: { isActive: true } };
export const Listening: Story = { args: { state: "recording", live: { level: 0.5 } } };
export const Writing: Story = {
  args: { state: "transcribing", snapshot: { endedAtMs: Date.now() - 6_000 } },
};
export const Heard: Story = { args: { state: "committed", snapshot: { heardText: "hi" } } };
export const Preparing: Story = { args: { state: "preparing", snapshot: { downloadPercent: 37 } } };
export const Failed: Story = { args: { state: "failed", snapshot: { failureDetail: null } } };
export const Denied: Story = { args: { state: "denied" } };
/** Right-click: the lean menu ("Start fresh"), drawn by the web fallback with the real items. */
export const ContextMenu: Story = { args: { openMenu: true } };
