/**
 * One lineage sub-run row: driver mark, title, status word, time.
 * Native lineage rows already paint their own provider glyph; this is the
 * app-owned child row only.
 */
import { BotIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { RollLabel } from "~/components/t3team-ThreadActivityStatus-rollLabel";
import { usePrimarySettings } from "~/hooks/useSettings";
import { formatRelativeTime } from "~/t3team/components/t3team-projectSidebarTimeLabels";
import type { ProjectThread } from "~/t3team/t3team-types";
import { useServerConfigs } from "~/state/entities";
import {
  resolveSubRunStatusLabel,
  type SubRunOpenCallback,
} from "./t3team-AgentsPanelForkSection.logic";
import { SubRunStatusIcon } from "./t3team-AgentsPanelSubRunStatusIcon";

const STATIC_LABELS = new Set([
  "Waiting",
  "Failed",
  "Stopped",
  "Completed",
  "Idle",
  "Question awaiting answer",
  "Plan awaiting approval",
]);

function useLivePhraseSpin(label: string, live: boolean): number {
  const prev = useRef(label);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current === label) return;
    prev.current = label;
    if (live) setTick((value) => value + 1);
  }, [label, live]);
  return tick;
}

function SubRunDriverMark({ instanceId }: { instanceId: string | undefined }) {
  const configs = useServerConfigs();
  const provider =
    instanceId === undefined
      ? undefined
      : [...configs.values()]
          .flatMap((config) => config.providers)
          .find((entry) => entry.instanceId === instanceId);
  if (!provider) {
    return <BotIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return (
    <ProviderInstanceIcon
      driverKind={provider.driver}
      displayName={provider.displayName ?? provider.driver}
      iconDataUrl={provider.iconDataUrl}
      acpRegistryIconUrl={provider.iconUrl}
      iconClassName="size-3.5"
      className="z-auto"
    />
  );
}

export function SubRunRow({
  thread,
  openThreadId,
  onOpen,
}: {
  thread: ProjectThread;
  openThreadId?: string | undefined;
  onOpen: SubRunOpenCallback;
}) {
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );
  const label = resolveSubRunStatusLabel(thread, { activityLabelsEnabled });
  const live = !STATIC_LABELS.has(label);
  const spinTick = useLivePhraseSpin(label, live);
  return (
    <button
      type="button"
      aria-current={openThreadId === thread.id ? "page" : undefined}
      onClick={() => onOpen({ projectId: thread.projectId, threadId: thread.id })}
      className="flex min-w-0 flex-1 items-center gap-2 text-left"
    >
      <SubRunDriverMark instanceId={thread.providerInstanceId} />
      <SubRunStatusIcon
        status={thread.status}
        label={label}
        pendingUserInput={thread.pendingUserInput === true}
        awaitingParent={thread.awaitingParent === true}
        spinTick={spinTick}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
      <span className="shrink-0 font-mono text-2xs text-muted-foreground/80">
        <RollLabel text={label} shimmer={live} />
      </span>
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/60">
        {formatRelativeTime(thread.lastMessageAt)}
      </span>
    </button>
  );
}
