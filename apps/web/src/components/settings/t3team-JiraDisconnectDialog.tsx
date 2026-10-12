"use client";

import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Spinner } from "../ui/spinner";

export function JiraDisconnectDialog({
  site,
  open,
  disconnecting,
  onOpenChange,
  onConfirm,
}: {
  readonly site: string;
  readonly open: boolean;
  readonly disconnecting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !disconnecting && onOpenChange(next)}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {site}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nexi Work stops syncing this site and forgets the sign-in. Tickets already synced stay
            on this device, and signing in again brings everything back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose
            disabled={disconnecting}
            render={<Button variant="outline" disabled={disconnecting} />}
          >
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={disconnecting}>
            {disconnecting ? <Spinner size="sm" /> : null}
            Disconnect
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
