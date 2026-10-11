import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";

/**
 * The digest is showing a draft. Keep promotes it to the live arrangement; discard drops it
 * and the board returns to the live plan (or the heuristic default).
 */
export function DigestDraftBar({
  producedAt,
  nowMs,
  onPromote,
  onDiscard,
}: {
  readonly producedAt: string;
  readonly nowMs: number;
  readonly onPromote?: (() => Promise<void>) | undefined;
  readonly onDiscard?: (() => Promise<void>) | undefined;
}) {
  const [pending, setPending] = useState<"keep" | "discard" | null>(null);
  const run = (which: "keep" | "discard", action: (() => Promise<void>) | undefined) => {
    if (action === undefined) return;
    setPending(which);
    void action().finally(() => setPending(null));
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Draft arrangement · {formatDigestAgo(nowMs, producedAt)} ago</span>
      {onPromote ? (
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => run("keep", onPromote)}>
          Keep
        </Button>
      ) : null}
      {onDiscard ? (
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => run("discard", onDiscard)}>
          Discard
        </Button>
      ) : null}
    </div>
  );
}
