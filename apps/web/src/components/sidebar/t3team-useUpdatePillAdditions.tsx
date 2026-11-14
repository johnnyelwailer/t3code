import type { DesktopUpdateState } from "@t3tools/contracts";
import { useState } from "react";

import type { DesktopUpdateButtonAction } from "../desktopUpdate.logic";
import { SidebarUpdateReleaseNotes } from "./SidebarUpdateReleaseNotes";
import { UpdatePopoverNotes } from "./t3team-UpdatePopoverNotes";
import { updateLocalApp } from "./t3team-updateLocalApp";
import { useUpdateNotes } from "./t3team-useUpdateNotes";
import { useUpdateNotesAttention } from "./t3team-useUpdateNotesAttention";
import { useUpdateRowActions } from "./t3team-useUpdateRowActions";

/**
 * Everything the update pill adds behind its flag: the dot, the one-time notes pop, the notes
 * popover with its own update action, and the dialog's per-entry updates.
 */
export function useUpdatePillAdditions({
  state,
  action,
  localUpdateVersion,
  runsEverything,
  showsNotesPopover,
  title,
  setNotesOpen,
  closeDialog,
}: {
  readonly state: DesktopUpdateState | null;
  readonly action: DesktopUpdateButtonAction;
  readonly localUpdateVersion: string | null;
  readonly runsEverything: boolean;
  readonly showsNotesPopover: boolean;
  readonly title: string;
  readonly setNotesOpen: (open: boolean) => void;
  readonly closeDialog: () => void;
}) {
  const notes = useUpdateNotes(state, action);
  const attention = useUpdateNotesAttention(
    notes !== null && showsNotesPopover ? notes.view.version : null,
  );
  const [appPending, setAppPending] = useState(false);
  const updateApp = (confirmed: boolean) => {
    if (state === null || action === "none") return;
    setAppPending(true);
    void updateLocalApp(action, state, { confirmed }).finally(() => setAppPending(false));
  };
  const renderEntry = useUpdateRowActions(localUpdateVersion, action, () => {
    closeDialog();
    updateApp(true);
  });
  const clickOpensNotes = notes !== null && !runsEverything && showsNotesPopover;
  if (attention.pop) {
    attention.markPopped();
    setNotesOpen(true);
  }
  const popoverAction = clickOpensNotes
    ? {
        action: {
          label: notes.updateLabel,
          disabled: appPending,
          onClick: () => {
            setNotesOpen(false);
            updateApp(false);
          },
        },
      }
    : {};
  return {
    clickOpensNotes,
    renderEntry,
    dot: attention.dot,
    markSeen: attention.markSeen,
    popoverContent: notes ? (
      <UpdatePopoverNotes title={title} view={notes.view} {...popoverAction}>
        {notes.list}
      </UpdatePopoverNotes>
    ) : state ? (
      <SidebarUpdateReleaseNotes shell={window.desktopBridge} state={state} tooltip={title} />
    ) : null,
  };
}
