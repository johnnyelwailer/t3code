/**
 * The one confirm before a run is switched off (doc 07 §2.3, decision 3).
 */
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";

export function RecipeRunToggleStopDialog({
  open,
  watched,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  watched: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Stop watching {watched} PR{watched === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Fixes in progress are stopped (including delegated work) and every watch is turned off.
            Your PRs are not touched. Switch on again to resume.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Keep watching</AlertDialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Stop
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
