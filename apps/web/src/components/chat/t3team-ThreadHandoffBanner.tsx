/**
 * The "moved" marker of a thread handoff, from the thread fact the move records: the original
 * thread says where it continues ("Moved to …"), the successor where it came from. Both link to
 * the other thread. Absent fact (or a server without fork facts) = no item.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, readThreadHandoffLink, type ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightLeftIcon } from "lucide-react";
import { useMemo } from "react";

import { useT3TeamThreadFacts } from "../../state/t3team-threadSideStreams";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function useThreadHandoffBannerItem(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ComposerBannerStackItem | null {
  const navigate = useNavigate();
  const link = readThreadHandoffLink(useT3TeamThreadFacts(input.environmentId, input.threadId));
  const direction = link?.direction ?? null;
  const peerEnvironmentId = link?.peerEnvironmentId ?? null;
  const peerThreadId = link?.peerThreadId ?? null;
  const peerLabel = link?.peerLabel ?? "";
  return useMemo<ComposerBannerStackItem | null>(() => {
    if (direction === null || peerEnvironmentId === null || peerThreadId === null) return null;
    const open = () =>
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(peerEnvironmentId, peerThreadId)),
      });
    return {
      id: "thread-handoff",
      variant: "info",
      priority: "notice",
      icon: <ArrowRightLeftIcon className="size-3.5" aria-hidden="true" />,
      title: direction === "moved_to" ? `Moved to ${peerLabel}` : `Moved here from ${peerLabel}`,
      actions: (
        <Button size="xs" variant="ghost" onClick={open}>
          {direction === "moved_to" ? "Open" : "Open original"}
        </Button>
      ),
    };
  }, [direction, navigate, peerEnvironmentId, peerLabel, peerThreadId]);
}
