import type { ReactNode } from "react";

import { Dialog, DialogPopup } from "~/t3team/components/ui/t3team-dialog";

/**
 * The one frame for the Jira project dialogs (add a project, repair a binding): the app's own
 * dialog primitive (focus trap, Esc, backdrop, scroll lock, bottom sheet on phones) at a fixed
 * height, so moving between screens never makes the window jump.
 */
export function JiraProjectDialogShell({
  children,
  onClose,
  dismissible = true,
}: {
  children: ReactNode;
  onClose: () => void;
  /** False while a create is running: Esc, backdrop and the close button do nothing then. */
  dismissible?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && dismissible) onClose();
      }}
    >
      <DialogPopup
        showCloseButton={dismissible}
        className="max-w-2xl max-sm:h-[calc(100dvh-3rem)] sm:h-[min(42rem,calc(100dvh-4rem))]"
      >
        {children}
      </DialogPopup>
    </Dialog>
  );
}
