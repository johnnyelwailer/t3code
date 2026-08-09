import { useEffect, useState } from "react";
import {
  broadcastAtlassianOAuthCallback,
  postAtlassianOAuthCallbackToOpener,
} from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { completeAtlassianOAuthServerFlow } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

type CallbackStatus =
  | { readonly kind: "working" }
  | { readonly kind: "connected" }
  /** Handed back to the tab that started the flow; nothing left for this window to do. */
  | { readonly kind: "returned" }
  | { readonly kind: "failed"; readonly error: unknown };

const COPY: Record<"working" | "connected" | "returned", { title: string; body: string }> = {
  working: { title: "Signing you in", body: "Finishing the connection to Atlassian." },
  connected: {
    title: "Atlassian connected",
    body: "You can close this tab. T3 Code picks the connection up on its own.",
  },
  returned: {
    title: "Signing you in",
    body:
      "You can close this tab and return to T3 Code. " +
      "If it still shows Atlassian as not connected, the sign-in link expired — start again from the app.",
  },
};

/**
 * Where Atlassian returns after sign-in — in whichever browser the user happened to sign in with.
 *
 * This page is a courier and nothing more. It holds no PKCE verifier and no client secret; it reads
 * `code` and `state` out of its own query string and hands them to the server, which owns the flow
 * and does the exchange. That is what makes sign-in completable from a different browser, a different
 * profile, or a phone, none of which have any state from the tab that started it.
 *
 * The older tab-owned flow is still supported alongside it: the opener post and the same-origin
 * broadcast happen first and synchronously, before anything awaits, so their timing is unchanged. If
 * the server does not recognise the `state`, that flow owns this callback and this window behaves
 * exactly as it did before — close if it can, otherwise tell the user they are done here.
 */
export function OAuthCallbackPage() {
  const [status, setStatus] = useState<CallbackStatus>({ kind: "working" });

  useEffect(() => {
    let cancelled = false;
    const href = window.location.href;
    const deliveredToOpener = postAtlassianOAuthCallbackToOpener(href);
    broadcastAtlassianOAuthCallback(href);

    void completeAtlassianOAuthServerFlow({ href }).then((outcome) => {
      if (cancelled) return;

      if (outcome.kind === "connected") {
        setStatus({ kind: "connected" });
        // A popup has served its purpose; the opener notices the new account by itself.
        if (deliveredToOpener) window.close();
        return;
      }

      if (outcome.kind === "not_server_flow") {
        /*
          The tab-owned flow already has what it needs from the messages above. A window the user
          opened by hand cannot be closed by script, so only close when there is an opener — telling
          someone a tab is about to vanish when it will not is worse than saying nothing.
        */
        if (deliveredToOpener) {
          window.close();
          return;
        }
        setStatus({ kind: "returned" });
        return;
      }

      // Atlassian refused, or the exchange failed. An opener surfaces its own error, so leave that
      // window's behaviour alone and only take over the page when this window is on its own.
      if (deliveredToOpener) {
        window.close();
        return;
      }
      setStatus({ kind: "failed", error: outcome.error });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6 text-foreground">
      {status.kind === "failed" ? (
        <T3TeamErrorState
          error={status.error}
          action="connecting to Atlassian"
          variant="page"
          className="w-full max-w-md"
        />
      ) : (
        <div className="text-center">
          <h1 className="text-lg font-semibold">{COPY[status.kind].title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{COPY[status.kind].body}</p>
        </div>
      )}
    </div>
  );
}
