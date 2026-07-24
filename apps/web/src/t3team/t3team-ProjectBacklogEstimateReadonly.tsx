import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import type {
  ProjectBacklogEstimatePresentation,
  ProjectBacklogEstimateTooltip,
} from "~/t3team/t3team-projectBacklogEstimate";

export function ProjectBacklogEstimateReadonlyValue({
  presentation,
  className,
}: {
  presentation: ProjectBacklogEstimatePresentation;
  className: string;
}) {
  const content = (
    <>
      <span>{presentation.valueText || "-"}</span>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {presentation.valueSuffix}
      </span>
    </>
  );

  if (!presentation.tooltip) {
    return (
      <div className={className} title={presentation.tooltipText}>
        {content}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<div className={className} aria-label={presentation.tooltipText} />}>
        {content}
      </TooltipTrigger>
      <TooltipPopup side="top" align="center" className="max-w-80 p-0">
        <ProjectBacklogEstimateTooltipContent tooltip={presentation.tooltip} />
      </TooltipPopup>
    </Tooltip>
  );
}

function ProjectBacklogEstimateTooltipContent({
  tooltip,
}: {
  tooltip: ProjectBacklogEstimateTooltip;
}) {
  return (
    <div className="w-[20rem] space-y-3 px-3 py-2.5 text-left text-[11px] leading-4">
      <div className="space-y-1.5 border-b border-border/70 pb-2">
        <div className="font-semibold text-foreground">{tooltip.title}</div>
        <div className="rounded-md bg-muted/55 px-2 py-1.5 font-medium text-foreground/85">
          {tooltip.formula}
        </div>
      </div>

      <div className="space-y-1.5">
        {tooltip.detailRows.map((detail) => (
          <div key={detail.label} className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">{detail.label}</span>
            <span className="text-right font-medium text-foreground">{detail.value}</span>
          </div>
        ))}
      </div>

      {tooltip.note ? (
        <div className="border-t border-border/70 pt-2 text-muted-foreground">{tooltip.note}</div>
      ) : null}
    </div>
  );
}
