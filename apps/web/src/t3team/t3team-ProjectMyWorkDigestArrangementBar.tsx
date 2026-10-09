import { SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import type { DigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

/**
 * Says the digest is arranged by an agent (the arrange-my-work recipe), since when, and offers the
 * way back to the default arrangement. Shown only while an arrangement is stored.
 */
export function DigestArrangementBar({
  arrangement,
  nowMs,
  onReset,
}: {
  arrangement: DigestPlan;
  nowMs: number;
  onReset?: (() => Promise<void>) | undefined;
}) {
  const [resetting, setResetting] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <SparklesIcon className="size-3.5" />
        Arranged by an agent · {formatDigestAgo(nowMs, arrangement.producedAt)} ago
      </span>
      {onReset ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={resetting}
          onClick={() => {
            setResetting(true);
            void onReset().finally(() => setResetting(false));
          }}
        >
          Back to default
        </Button>
      ) : null}
    </div>
  );
}
