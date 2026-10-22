import type { ContextMenuItem, ThreadId } from "@t3tools/contracts";
import { useCallback } from "react";

import { readLocalApi } from "~/localApi";
import { notifyVoiceFailure } from "./t3team-useVoiceCommit";
import { makeVoiceSessionDeps } from "./t3team-voiceSessionDeps";
import { startFreshVoiceThread } from "./t3team-voiceSessionReset";

export type VoiceRowMenuId = "start-fresh";

/** The voice row's whole context menu: lean on purpose, the thread itself has the rest. */
export const VOICE_ROW_MENU: ReadonlyArray<ContextMenuItem<VoiceRowMenuId>> = [
  { id: "start-fresh", label: "Start fresh", icon: "message-square-plus" },
];

/**
 * Opens the voice row's menu at the pointer. "Start fresh" replaces the voice thread with a new
 * one; when the old one was on screen, the new one is opened in its place.
 */
export function useVoiceRowMenu(input: {
  readonly isActive: boolean;
  readonly onOpenThread?: ((threadId: ThreadId) => void) | undefined;
}): (position: { readonly x: number; readonly y: number }) => void {
  const { isActive, onOpenThread } = input;
  return useCallback(
    (position) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clicked = await api.contextMenu
          .show(VOICE_ROW_MENU, { x: position.x, y: position.y })
          .catch(() => null);
        if (clicked !== "start-fresh") return;
        const deps = makeVoiceSessionDeps();
        if (deps === null) {
          notifyVoiceFailure("send-failed", "No server connection.");
          return;
        }
        const result = await startFreshVoiceThread(deps);
        if (result.status === "error") notifyVoiceFailure(result.code, result.detail);
        else if (isActive) onOpenThread?.(result.threadId);
      })();
    },
    [isActive, onOpenThread],
  );
}
