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
import { isGitHubSignInRunning } from "~/t3team/hooks/t3team-useGitHubSignIn";

import {
  clearCloudSessionSignIn,
  toolAuthStateIsForHost,
  useCloudSessionSignInStore,
} from "./t3team-cloudSessionSignIn";

const GH = toolAuthMetaForTool("gh");

/**
 * Signs the GitHub CLI in to the host a session action needed (the session host, or the project's
 * repository host — the failure names it), then runs the action again: the user approves one
 * device code instead of reading an error. The gh device flow itself is the Connected tools one
 * (`toolAuth.start` for `gh`, with that host), so the sign-in is the same wherever it starts.
 */
export function CloudSessionSignInDialogHost() {
  const request = useCloudSessionSignInStore((state) => state.request);
  const environmentId = usePrimaryEnvironmentId();
  const host = request?.host;
  const ghState = useToolAuthStates(environmentId).get(GH.tool);
  // gh's state is about one host. One about another host (the default login host's status, say)
  // is not this request's: it is neither a credential for it nor a sign-in to watch.
  const state = toolAuthStateIsForHost(ghState, host) ? ghState : undefined;
  const { onConnect, onSubmitCode, onCancel } = useToolAuthActions(GH, environmentId, {
    hostname: host,
  });
  const phase = state?.phase ?? "idle";
  // The action is repeated only after a sign-in THIS dialog started reached `connected` by way
  // of another phase. A credential gh already had, or a status re-probe flickering through
  // `idle`, is not a sign-in and must not re-run the action.
  const startedRef = useRef(false);
  const sawSignInRef = useRef(false);
  const startedHereRef = useRef(false);
  const startSignIn = () => {
    startedRef.current = true;
    startedHereRef.current = true;
    sawSignInRef.current = false;
    onConnect();
  };

  useEffect(() => {
    startedRef.current = false;
    startedHereRef.current = false;
    sawSignInRef.current = false;
    if (request === null || phase === "connected") return;
    // A sign-in already running (another surface started it) is watched, not started twice.
    if (isGitHubSignInRunning(phase)) startedRef.current = true;
    else startSignIn();
    // Once per request; phase changes are handled below.
  }, [request]);

  useEffect(() => {
    if (request === null || !startedRef.current) return;
    if (phase !== "connected") {
      sawSignInRef.current = true;
      return;
    }
    if (!sawSignInRef.current) return;
    clearCloudSessionSignIn();
    request.retry();
  }, [phase, request]);

  const staleCredential = request !== null && phase === "connected" && !startedRef.current;
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (open) return;
        // Only a sign-in this dialog started is cancelled; one started elsewhere (Settings) is
        // that surface's to end.
        if (startedHereRef.current && phase !== "connected") onCancel();
        clearCloudSessionSignIn();
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {host === undefined ? "Sign in to GitHub" : `Sign in to ${host}`}
          </DialogTitle>
          <DialogDescription>
            Cloud sessions run through your GitHub account. Approve the sign-in and the session
            starts right after.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          <div className="overflow-hidden rounded-xl border bg-card">
            <ToolAuthCard
              meta={
                host === undefined
                  ? GH
                  : {
                      ...GH,
                      description: `Log in to your ${host} account so cloud sessions can use it.`,
                    }
              }
              state={state}
              onConnect={startSignIn}
              onSubmitCode={onSubmitCode}
              onCancel={onCancel}
            />
          </div>
          {staleCredential ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              GitHub refused the saved sign-in.
              <Button size="sm" variant="outline" onClick={startSignIn}>
                Sign in again
              </Button>
            </div>
          ) : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
