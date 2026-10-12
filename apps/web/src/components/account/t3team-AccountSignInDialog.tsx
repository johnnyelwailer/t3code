import type { AccountStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

/**
 * The device-code sign-in as a dialog rather than a squeezed sidebar button: the code needs room,
 * and "Copy code & open" is the one action. Opens when a sign-in is waiting on the user, closes on
 * its own once the account is signed in, and can be dismissed — the sidebar entry reopens it.
 */
export function AccountSignInDialog({
  account,
  reopenToken,
  onOpenVerification,
}: {
  readonly account: AccountStatus;
  /** Bumped by the sidebar entry to show the dialog again after a dismissal. */
  readonly reopenToken: number;
  readonly onOpenVerification: () => void;
}) {
  const auth = account.auth;
  const signingIn = auth._tag === "SigningIn";
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!signingIn) setDismissed(false);
  }, [signingIn]);
  useEffect(() => {
    if (reopenToken > 0) setDismissed(false);
  }, [reopenToken]);

  return (
    <Dialog open={signingIn && !dismissed} onOpenChange={(open) => setDismissed(!open)}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to {account.label}</DialogTitle>
          <DialogDescription>
            Finish signing in in the browser window that opened. This closes by itself when you are
            done.
          </DialogDescription>
        </DialogHeader>
        {auth._tag === "SigningIn" && auth.userCode !== null ? (
          <DialogPanel className="space-y-2">
            <p className="text-muted-foreground text-sm">
              No window? Enter this code on the sign-in page:
            </p>
            <p className="rounded-lg border border-border bg-muted/40 py-3 text-center font-mono text-2xl font-semibold tracking-widest">
              {auth.userCode}
            </p>
          </DialogPanel>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDismissed(true)}>
            Close
          </Button>
          {auth._tag === "SigningIn" && auth.userCode !== null ? (
            <Button onClick={onOpenVerification}>Copy code & open sign-in page</Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
