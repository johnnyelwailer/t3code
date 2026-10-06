import { useEffect, useRef } from "react";

import { ToolAuthCard } from "~/components/settings/t3team-ToolAuthCard";
import { toolAuthMetaForTool } from "~/components/settings/t3team-toolAuthTools";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useToolAuthActions, useToolAuthStates } from "~/state/t3team-toolauth";

import { clearCloudSessionSignIn, useCloudSessionSignInStore } from "./t3team-cloudSessionSignIn";

const GH = toolAuthMetaForTool("gh");

/**
 * Signs the GitHub CLI in to the cloud-session host when a session action needed it, then runs
 * the action again — the user approves one device code instead of reading an error. The gh
 * device flow itself is the Connected tools one (`toolAuth.start` for `gh`), so the sign-in is
 * the same wherever it starts.
 */
export function CloudSessionSignInDialogHost() {
  const request = useCloudSessionSignInStore((state) => state.request);
  const environmentId = usePrimaryEnvironmentId();
  const state = useToolAuthStates(environmentId).get(GH.tool);
  const { onConnect, onSubmitCode, onCancel } = useToolAuthActions(GH, environmentId);
  const phase = state?.phase ?? "idle";
  // The action is repeated only after a sign-in this dialog watched happen: a phase other than
  // `connected` seen first, then `connected`. A credential gh already had is not proof enough.
  const sawSignInRef = useRef(false);

  useEffect(() => {
    sawSignInRef.current = false;
    if (request !== null && phase !== "connected") onConnect();
    // Start once per request, not on every phase change (those are handled below).
  }, [request]);

  useEffect(() => {
    if (request === null) return;
    if (phase !== "connected") {
      sawSignInRef.current = true;
      return;
    }
    if (!sawSignInRef.current) return;
    clearCloudSessionSignIn();
    request.retry();
  }, [phase, request]);

  const staleCredential = request !== null && phase === "connected" && !sawSignInRef.current;
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (open) return;
        if (phase !== "connected" && phase !== "idle") onCancel();
        clearCloudSessionSignIn();
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to GitHub</DialogTitle>
          <DialogDescription>
            Cloud sessions run through your GitHub account. Approve the sign-in and the session
            starts right after.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          <div className="overflow-hidden rounded-xl border bg-card">
            <ToolAuthCard
              meta={GH}
              state={state}
              onConnect={onConnect}
              onSubmitCode={onSubmitCode}
              onCancel={onCancel}
            />
          </div>
          {staleCredential ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              GitHub refused the saved sign-in.
              <Button size="sm" variant="outline" onClick={onConnect}>
                Sign in again
              </Button>
            </div>
          ) : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
