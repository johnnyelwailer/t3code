import type { DesktopUpdateState } from "@t3tools/contracts";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import type { DesktopUpdateButtonAction } from "../desktopUpdate.logic";
import { openDesktopUpdateReleaseNotes } from "../desktopUpdate.toast";
import { getAppUpdateNotesView } from "./t3team-nexiUpdateNotice.logic";
import { UpdateReleaseNotesList } from "./t3team-UpdateReleaseNotesList";

const APP_UPDATE_LABELS = {
  download: "Download now",
  install: "Install now",
} as const;

/** The app update's plain notes for the pill popover, and the label of its own update action. */
export function useUpdateNotes(
  state: DesktopUpdateState | null,
  action: DesktopUpdateButtonAction,
) {
  const enabled = useFeatureFlag("UI_UPDATE_APP_ONLY");
  if (!enabled || state === null || action === "none") return null;
  const view = getAppUpdateNotesView(state);
  if (view === null) return null;
  return {
    view,
    updateLabel: APP_UPDATE_LABELS[action],
    list: (
      <UpdateReleaseNotesList
        heading="What's changed"
        notes={view.notes}
        releaseUrl={view.releaseUrl}
        onOpenHistory={(url) => void openDesktopUpdateReleaseNotes(window.desktopBridge, url)}
      />
    ),
  };
}
