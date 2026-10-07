/**
 * Sub-run status glyph: one ThreadActivityMorphIcon (solid when the run
 * completed, a spin when the activity phrase changes). A docked question and
 * an error keep their own glyphs.
 */
import { CircleAlertIcon, CircleQuestionMarkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { ThreadActivityMorphIcon } from "~/components/t3team-ThreadActivityStatus";
import type { ProjectThread } from "~/t3team/t3team-types";

function usePhraseSpinTick(phrase: string): number {
  const previous = useRef(phrase);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (previous.current === phrase) return;
    previous.current = phrase;
    setTick((value) => value + 1);
  }, [phrase]);
  return tick;
}

export function SubRunStatusIcon({
  status,
  shellStatus,
  pendingUserInput = false,
  awaitingParent = false,
  activityLabel,
  className,
}: {
  status: ProjectThread["status"];
  shellStatus?: ProjectThread["shellStatus"];
  pendingUserInput?: boolean;
  awaitingParent?: boolean;
  activityLabel?: string | null;
  /** Optional size override (the fold list renders smaller glyphs). */
  className?: string;
}) {
  const iconClass = className ?? "size-3";
  const livePhrase =
    shellStatus === "running" ||
    (status === "running" && shellStatus !== "waiting" && shellStatus !== "failed")
      ? (activityLabel ?? "")
      : "";
  const spinTick = usePhraseSpinTick(livePhrase);
  if (pendingUserInput || awaitingParent) {
    return (
      <CircleQuestionMarkIcon
        aria-hidden
        className={cn("shrink-0 text-warning-foreground", iconClass)}
      />
    );
  }
  if (shellStatus === "failed" || status === "error") {
    return <CircleAlertIcon aria-hidden className={cn("shrink-0 text-destructive", iconClass)} />;
  }
  const completed =
    shellStatus === "completed" || (shellStatus === undefined && status === "completed");
  const live =
    shellStatus === "running" ||
    shellStatus === "starting" ||
    shellStatus === "preparing" ||
    (status === "running" &&
      shellStatus !== "waiting" &&
      shellStatus !== "queued" &&
      shellStatus !== "completed" &&
      shellStatus !== "interrupted" &&
      shellStatus !== "cancelled" &&
      shellStatus !== "rolled_back");
  return (
    <span
      className={cn(
        "inline-flex shrink-0",
        completed
          ? "text-muted-foreground/70"
          : live
            ? "text-info-foreground"
            : "text-muted-foreground/40",
        className,
      )}
    >
      <ThreadActivityMorphIcon
        solid={completed}
        pulse={live}
        spin={live}
        spinTick={spinTick}
        size="sm"
        {...(className !== undefined ? { className } : {})}
      />
    </span>
  );
}
