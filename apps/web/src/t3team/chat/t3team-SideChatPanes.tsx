import type { ScopedThreadRef } from "@t3tools/contracts";
import { memo, useState, type ReactNode } from "react";

import SideChatPane from "~/components/chat/SideChatPane";
import type { SideChatParentPanel } from "~/lib/sideChatPane";
import type { RightPanelSurface } from "~/rightPanelStore";
import { keptSideChatIds } from "~/t3team/chat/t3team-keptSideChats";
import { PendingSideChat } from "~/t3team/chat/t3team-PendingSideChat";
import { usePendingSideChatPrompt } from "~/t3team/chat/t3team-sideChatPending";

type SideChatSurface = Extract<RightPanelSurface, { kind: "side-chat" }>;

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const SideChatBody = memo(function SideChatBody(props: {
  readonly parentRef: ScopedThreadRef;
  readonly surface: SideChatSurface;
  readonly parentPanel: SideChatParentPanel;
  readonly onCloseSurface: (surface: RightPanelSurface) => void;
}) {
  const pendingPrompt = usePendingSideChatPrompt(props.surface.threadId);
  if (pendingPrompt !== undefined) return <PendingSideChat prompt={pendingPrompt} />;
  return (
    <SideChatPane
      parentRef={props.parentRef}
      threadId={props.surface.threadId}
      parentPanel={props.parentPanel}
      onClose={() => props.onCloseSurface(props.surface)}
    />
  );
});

/**
 * Hosts upstream's side chat panes so the last few stay mounted and only hide when another tab is
 * shown. Invisible, not suspended or `display: none`: a suspended tiptap editor loses its view,
 * and the message list cannot measure without layout.
 */
export function SideChatPanes(props: {
  readonly parentRef: ScopedThreadRef;
  readonly surfaces: ReadonlyArray<RightPanelSurface>;
  readonly activeSurface: RightPanelSurface | null;
  readonly parentPanel: SideChatParentPanel;
  readonly onCloseSurface: (surface: RightPanelSurface) => void;
  readonly children: ReactNode;
}) {
  const sideChats = new Map<string, SideChatSurface>();
  for (const surface of props.surfaces) {
    if (surface.kind === "side-chat") sideChats.set(surface.id, surface);
  }
  const activeId = props.activeSurface?.kind === "side-chat" ? props.activeSurface.id : null;
  const [kept, setKept] = useState<ReadonlyArray<string>>([]);
  const nextKept = keptSideChatIds(kept, activeId, new Set(sideChats.keys()));
  if (!sameIds(nextKept, kept)) setKept(nextKept);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {activeId === null ? props.children : null}
      {nextKept.map((id) => {
        const surface = sideChats.get(id);
        if (surface === undefined) return null;
        const shown = id === activeId;
        return (
          <div
            key={id}
            inert={!shown}
            aria-hidden={!shown}
            className={
              shown
                ? "flex min-h-0 flex-1 flex-col"
                : "pointer-events-none invisible absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            }
          >
            <SideChatBody
              parentRef={props.parentRef}
              surface={surface}
              parentPanel={props.parentPanel}
              onCloseSurface={props.onCloseSurface}
            />
          </div>
        );
      })}
    </div>
  );
}
