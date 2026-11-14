import type { DesktopUpdateState } from "@t3tools/contracts";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import {
  type DesktopUpdateButtonAction,
  getDesktopUpdateDownloadedVersion,
} from "../desktopUpdate.logic";
import { UpdateNotesAutoPop } from "./t3team-UpdateNotesAutoPop";
import { updateLocalApp } from "./t3team-updateLocalApp";
import { useUpdateNotesAttention } from "./t3team-useUpdateNotesAttention";
import { useUpdateRowActions } from "./t3team-useUpdateRowActions";
import type { useUpdateEverything } from "./useUpdateEverything";

/**
 * What the update pill adds behind its flag: the dot, the existing notes popover opening once per
 * version, and the dialog's per-row updates. `autoPop` belongs in the branch that renders the
 * popover, so a pill replaced by another footer never spends the pop.
 */
export function useUpdatePillAdditions({
  state,
  action,
  everything,
  showsNotesPopover,
  setNotesOpen,
  closeDialog,
}: {
  readonly state: DesktopUpdateState | null;
  readonly action: DesktopUpdateButtonAction;
  readonly everything: Pick<ReturnType<typeof useUpdateEverything>, "rows" | "servers">;
  readonly showsNotesPopover: boolean;
  readonly setNotesOpen: (open: boolean) => void;
  readonly closeDialog: () => void;
}) {
  const enabled = useFeatureFlag("UI_UPDATE_BADGE_ROW_ACTIONS");
  const version =
    enabled && state !== null && action !== "none" && showsNotesPopover
      ? getDesktopUpdateDownloadedVersion(state)
      : null;
  const attention = useUpdateNotesAttention(version);
  const renderEntry = useUpdateRowActions(everything.rows, everything.servers, action, () => {
    closeDialog();
    if (state !== null && action !== "none")
      void updateLocalApp(action, state, { confirmed: true });
  });
  return {
    renderEntry,
    dot: attention.dot,
    markSeen: attention.markSeen,
    autoPop: attention.pop ? (
      <UpdateNotesAutoPop
        onPop={() => {
          attention.markPopped();
          setNotesOpen(true);
        }}
      />
    ) : null,
  };
}
