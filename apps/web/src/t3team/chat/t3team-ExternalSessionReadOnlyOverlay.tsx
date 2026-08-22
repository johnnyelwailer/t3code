import { LockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import type { ExternalSession } from "./t3team-externalSessionState";
import { externalProviderName } from "./t3team-externalSessionState";

export function ExternalSessionReadOnlyOverlay({
  session,
  onForkConversation,
}: {
  readonly session: ExternalSession;
  readonly onForkConversation?: () => Promise<void> | void;
}) {
  const provider = externalProviderName(session.provider);
  const [forkPending, setForkPending] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const handleForkConversation = async () => {
    if (!onForkConversation || forkPending) return;
    setForkError(null);
    setForkPending(true);
    try {
      await onForkConversation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setForkError(message || "Could not open an editable fork. Please try again.");
    } finally {
      setForkPending(false);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center rounded-[22px] bg-background/90 p-3 backdrop-blur-sm"
      data-external-session-read-only="true"
      aria-live="polite"
    >
      <div className="flex max-w-lg items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground shadow-sm">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="space-y-2">
          <div className="font-medium">External {provider} session is active</div>
          <div className="text-muted-foreground">
            Read-only here. It updated less than 90 seconds ago in another app.
          </div>
          {onForkConversation ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void handleForkConversation()}
                disabled={forkPending}
              >
                {forkPending ? "Forking..." : "Fork this thread"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Opens an editable thread in this project and clones the full history.
              </span>
            </div>
          ) : null}
          {forkError ? <div className="text-xs text-destructive">{forkError}</div> : null}
        </div>
      </div>
    </div>
  );
}
