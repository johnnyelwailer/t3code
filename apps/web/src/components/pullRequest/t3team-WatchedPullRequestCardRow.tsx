/**
 * One watcher in the indicator's card: status, thread title, upstream's stop eye, then what the
 * thread is doing and the babysitter's chips, then the actions (doc 07 §3.3). *Not mine* and
 * *Take over* are the thread's runtime mode; *Leave it* is "stop including sub-runs" plus the
 * watch command; *Open thread* navigates.
 */
import { CommandId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { runtimeModeConfig } from "~/components/chat/runtimeModeConfig";
import { formatWorkingDurationLabel, type ThreadStatusPill } from "~/components/Sidebar.logic";
import { StopWatchingButton, ThreadStatusLabel } from "~/components/ThreadStatusIndicators";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useNowMinute } from "~/hooks/useNowMinute";
import { randomUUID } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import type { WatchedPullRequestWatcher } from "~/state/t3team-watchedPullRequests.logic";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { stopThreadCascade } from "~/t3team/chat/t3team-useStopCascade";
import { buildThreadRouteParams } from "~/threadRoutes";

import { WATCHED_TONE_DOT_CLASS, WATCHED_TONE_TEXT_CLASS } from "./t3team-watchedPullRequestEye";

function statusPill(watcher: WatchedPullRequestWatcher, nowMs: number): ThreadStatusPill {
  const label = watcher.statusLabel === "Parked" ? "Pending Approval" : watcher.statusLabel;
  return {
    label,
    colorClass: WATCHED_TONE_TEXT_CLASS[watcher.tone],
    dotClass: WATCHED_TONE_DOT_CLASS[watcher.tone] ?? "bg-muted-foreground/50",
    pulse: false,
    ...(watcher.statusLabel === "Parked" ? { activityLabel: "Parked" } : {}),
    ...(watcher.tone === "working" && watcher.workingSince
      ? {
          activityLabel: `Working · ${formatWorkingDurationLabel(nowMs - Date.parse(watcher.workingSince))}`,
        }
      : {}),
  };
}

function chipsOf(watcher: WatchedPullRequestWatcher): ReadonlyArray<string> {
  const facts = watcher.prWatch;
  if (facts === null) return [];
  return [
    facts.ownership
      ? [facts.ownership.verdict, facts.ownership.source].filter(Boolean).join(" · ")
      : null,
    facts.merge
      ? [`merge ${facts.merge.mode}`, facts.merge.source].filter(Boolean).join(" · ")
      : null,
    facts.model ?? null,
  ].filter((chip): chip is string => chip !== null);
}

export function WatchedPullRequestCardRow({
  watcher,
  link,
  ownershipActions = "always",
}: {
  watcher: WatchedPullRequestWatcher;
  link: ThreadPullRequestLink;
  /** The count hover offers Take over / Not mine only while ownership is `unsure` (decision 5). */
  ownershipActions?: "always" | "unsure-only";
}) {
  const navigate = useNavigate();
  const setRuntimeMode = useAtomCommand(threadEnvironment.setRuntimeMode, { reportFailure: true });
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: true });
  const stopCascade = useAtomCommand(stopThreadCascade, { reportFailure: true });
  const cascadeSupported =
    useServerConfigs().get(watcher.threadRef.environmentId)?.environment.capabilities.t3team
      ?.stopCascade === true;
  const [leaving, setLeaving] = useState(false);
  const nowMs = Date.parse(useNowMinute());
  const { environmentId, threadId } = watcher.threadRef;
  const babysitter = watcher.recipeId !== null || watcher.prWatch !== null;
  const supervised = watcher.runtimeMode === "approval-required";
  // What the thread is doing, else what it asks, else why it waits (doc 07 §2.4, §3.3).
  const underline =
    watcher.activityLabel ??
    watcher.prWatch?.note ??
    (watcher.prWatch?.parked ? `Parked · ${watcher.prWatch.parked.reason}` : null) ??
    (watcher.prWatch?.lastWake ? `Last wake: ${watcher.prWatch.lastWake.text}` : null);
  const chips = chipsOf(watcher);
  const showOwnershipAction =
    ownershipActions === "always" || watcher.prWatch?.ownership?.verdict === "unsure";

  const leave = async () => {
    setLeaving(true);
    try {
      if (cascadeSupported) {
        await stopCascade({
          environmentId,
          input: { threadId, commandId: CommandId.make(randomUUID()) },
        });
      }
      await watch({
        environmentId,
        input: {
          threadId,
          host: link.host,
          repository: link.repository,
          number: link.number,
          watching: false,
        },
      });
    } finally {
      setLeaving(false);
    }
  };

  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-sm px-1 py-1"
      data-testid="watched-pull-request-row"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
          {watcher.threadTitle}
        </span>
        <ThreadStatusLabel status={statusPill(watcher, nowMs)} />
        <StopWatchingButton threadRef={watcher.threadRef} link={link} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-muted-foreground">
        {underline ? <span className="min-w-0 truncate">{underline}</span> : null}
        <Badge variant="secondary" size="sm">
          {babysitter ? "Babysitter" : "Thread"}
        </Badge>
        <Badge variant="secondary" size="sm">
          {runtimeModeConfig[watcher.runtimeMode]?.label ?? watcher.runtimeMode}
        </Badge>
      </div>
      {chips.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-sm border border-border/70 bg-muted px-1 font-mono text-3xs text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost-muted"
          size="xs"
          onClick={() =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(watcher.threadRef),
            })
          }
        >
          Open thread
        </Button>
        {showOwnershipAction ? (
          <Button
            variant="ghost-muted"
            size="xs"
            onClick={() =>
              void setRuntimeMode({
                environmentId,
                input: { threadId, runtimeMode: supervised ? "full-access" : "approval-required" },
              })
            }
          >
            {supervised ? "Take over" : "Not mine"}
          </Button>
        ) : null}
        <Button
          variant="ghost-destructive"
          size="xs"
          className="ml-auto"
          disabled={leaving}
          onClick={() => void leave()}
        >
          Leave it
        </Button>
      </div>
    </li>
  );
}
