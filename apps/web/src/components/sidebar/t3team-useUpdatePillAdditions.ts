import type { DesktopUpdateState } from "@t3tools/contracts";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import {
  type DesktopUpdateButtonAction,
  getDesktopUpdateDownloadedVersion,
} from "../desktopUpdate.logic";
import { getNexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";
import { updateLocalApp } from "./t3team-updateLocalApp";
import { useUpdateNotesAttention } from "./t3team-useUpdateNotesAttention";
import { useUpdateRowActions } from "./t3team-useUpdateRowActions";
import type { useUpdateEverything } from "./useUpdateEverything";

/**
 * What the update pill adds behind its flag: the dot, the existing notes popover opening once per
 * version, and the dialog's per-entry updates.
 */
export function useUpdatePillAdditions({
  state,
  action,
  everything,
  runsEverything,
  showsNotesPopover,
  setNotesOpen,
  closeDialog,
}: {
  readonly state: DesktopUpdateState | null;
  readonly action: DesktopUpdateButtonAction;
  readonly everything: Pick<ReturnType<typeof useUpdateEverything>, "rows" | "servers">;
  readonly runsEverything: boolean;
  readonly showsNotesPopover: boolean;
  readonly setNotesOpen: (open: boolean) => void;
  readonly closeDialog: () => void;
}) {
  const enabled = useFeatureFlag("UI_UPDATE_BADGE_ROW_ACTIONS");
  // Nexi's ready footer replaces the pill, popover included; the footer pops its own notes.
  const footerReplacesPill = getNexiUpdateNoticeView(state) !== null && !runsEverything;
  const version =
    enabled && state !== null && action !== "none" && showsNotesPopover && !footerReplacesPill
      ? getDesktopUpdateDownloadedVersion(state)
      : null;
  const attention = useUpdateNotesAttention(version);
  if (attention.pop) {
    attention.markPopped();
    setNotesOpen(true);
  }
  const renderEntry = useUpdateRowActions(everything.rows, everything.servers, action, () => {
    closeDialog();
    if (state !== null && action !== "none")
      void updateLocalApp(action, state, { confirmed: true });
  });
  return { renderEntry, dot: attention.dot, markSeen: attention.markSeen };
}
