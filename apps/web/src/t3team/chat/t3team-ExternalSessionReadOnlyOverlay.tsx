import { LockIcon } from "lucide-react";

import type { ExternalSession } from "./t3team-externalSessionState";
import { externalProviderName } from "./t3team-externalSessionState";

export function ExternalSessionReadOnlyOverlay({ session }: { readonly session: ExternalSession }) {
  const provider = externalProviderName(session.provider);
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center rounded-[22px] bg-background/90 p-3 backdrop-blur-sm"
      data-external-session-read-only="true"
      aria-live="polite"
    >
      <div className="flex max-w-lg items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground shadow-sm">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <div className="font-medium">External {provider} session is active</div>
          <div className="text-muted-foreground">
            Read-only here. It updated less than 90 seconds ago in another app.
          </div>
        </div>
      </div>
    </div>
  );
}
