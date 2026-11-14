import type { DesktopUpdateState } from "@t3tools/contracts";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import type { DesktopUpdateButtonAction } from "../desktopUpdate.logic";
import { openDesktopUpdateReleaseNotes } from "../desktopUpdate.toast";
import { getAppUpdateNotesView } from "./t3team-nexiUpdateNotice.logic";
import { UpdateReleaseNotesList } from "./t3team-UpdateReleaseNotesList";

const APP_ONLY_LABELS = {
  download: "Download app only",
  install: "Install app only",
} as const;

/** Update-dialog additions for an app update on offer: what changed, and updating only the app. */
export function useUpdateDialogAppOnly(
  state: DesktopUpdateState | null,
  action: DesktopUpdateButtonAction,
  onAppOnly: () => void,
) {
  const enabled = useFeatureFlag("UI_UPDATE_APP_ONLY");
  if (!enabled || state === null || action === "none") return {};
  const notes = getAppUpdateNotesView(state);
  return {
    releaseNotes: notes ? (
      <UpdateReleaseNotesList
        heading="What's changed"
        notes={notes.notes}
        releaseUrl={notes.releaseUrl}
        onOpenHistory={(url) => void openDesktopUpdateReleaseNotes(window.desktopBridge, url)}
      />
    ) : null,
    secondaryAction: { label: APP_ONLY_LABELS[action], onClick: onAppOnly },
  };
}
