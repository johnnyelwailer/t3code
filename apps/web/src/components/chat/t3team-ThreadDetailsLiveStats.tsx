/**
 * Live statistics from a provider with no quota (for example a self-hosted gateway's running
 * requests), shown in the thread details "Usage limits" section in place of limit windows.
 * Rows mirror the section's limit rows: label, optional hairline bar, value, and a tooltip.
 */
import type { ServerProviderUsageStat } from "@t3tools/contracts";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

export function T3TeamThreadDetailsLiveStats({
  stats,
}: {
  readonly stats: ReadonlyArray<ServerProviderUsageStat>;
}) {
  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title="Usage limits"
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        {stats.map((stat) => (
          <LiveStatRow key={stat.id} stat={stat} />
        ))}
      </div>
    </ThreadDetailsSection>
  );
}

function LiveStatRow({ stat }: { readonly stat: ServerProviderUsageStat }) {
  const fill = stat.usedPercent === undefined ? null : Math.round(stat.usedPercent);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            aria-label={`${stat.label}: ${stat.value}`}
            className="col-span-3 grid h-6 cursor-default grid-cols-subgrid items-center rounded-lg px-2.5 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]"
          />
        }
      >
        <span className="max-w-28 truncate text-muted-foreground">{stat.label}</span>
        {fill !== null ? (
          <span className="relative h-[3px] rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20">
            {fill > 0 ? (
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground"
                style={{ width: `max(${fill}%, 6px)` }}
              />
            ) : null}
          </span>
        ) : null}
        <span
          className={
            fill === null
              ? "col-span-2 text-end font-medium text-muted-foreground tabular-nums"
              : "text-end font-medium text-foreground/80 tabular-nums"
          }
        >
          {stat.value}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left" sideOffset={16}>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">
            {stat.label}: {stat.value}
          </span>
          {stat.detail ? <span className="text-muted-foreground">{stat.detail}</span> : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
