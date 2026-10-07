import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";

import { useServerConfigs, useThreadShells } from "~/state/entities";
import { RollLabel } from "~/components/t3team-ThreadActivityStatus-rollLabel";
import { usePrimarySettings } from "~/hooks/useSettings";
import { formatRelativeTime } from "~/t3team/components/t3team-projectSidebarTimeLabels";
import type { ProjectThread } from "~/t3team/t3team-types";
import {
  resolveSubRunStatusLabel,
  type SubRunOpenCallback,
} from "./t3team-AgentsPanelForkSection.logic";
import { SubRunStatusIcon } from "./t3team-AgentsPanelSubRunStatusIcon";
import {
  SubRunDriverIcon,
  subRunDriverFromCatalog,
  type SubRunDriver,
} from "./t3team-subRunDriverIcon";

function useChildDriver(threadId: string): SubRunDriver | null {
  const shells = useThreadShells();
  const configs = useServerConfigs();
  return useMemo(() => {
    const shell = shells.find((item) => item.id === threadId);
    if (!shell) return null;
    return (
      subRunDriverFromCatalog({
        providers: configs.get(shell.environmentId)?.providers,
        instanceId: shell.runtime?.providerInstanceId ?? shell.providerInstanceId,
      }) ?? null
    );
  }, [configs, shells, threadId]);
}

/** One sub-run: driver glyph, title, status text, time. */
export function AgentsPanelSubRunRow({
  thread,
  onOpen,
}: {
  thread: ProjectThread;
  onOpen: SubRunOpenCallback;
}) {
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );
  const driver = useChildDriver(thread.id);
  const routeThreadId = useParams({ strict: false }).threadId;
  const label = resolveSubRunStatusLabel(thread, { activityLabelsEnabled });
  const live =
    thread.shellStatus === "running" &&
    activityLabelsEnabled &&
    typeof thread.activityLabel === "string" &&
    thread.activityLabel.trim() !== "";
  return (
    <button
      type="button"
      onClick={() => onOpen({ projectId: thread.projectId, threadId: thread.id })}
      aria-current={routeThreadId === thread.id ? "page" : undefined}
      className="flex min-w-0 flex-1 items-center gap-2 text-left"
    >
      <SubRunDriverIcon driver={driver} />
      <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-2xs text-muted-foreground/80">
        <SubRunStatusIcon
          status={thread.status}
          {...(thread.shellStatus !== undefined ? { shellStatus: thread.shellStatus } : {})}
          pendingUserInput={thread.pendingUserInput === true}
          awaitingParent={thread.awaitingParent === true}
          activityLabel={thread.activityLabel ?? null}
        />
        <RollLabel text={label} shimmer={live} />
      </span>
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/60">
        {formatRelativeTime(thread.lastMessageAt)}
      </span>
    </button>
  );
}
