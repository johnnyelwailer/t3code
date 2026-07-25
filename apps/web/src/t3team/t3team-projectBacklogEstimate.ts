import {
  getProjectTicketIssueTypeKey,
  isProjectTicketHourTracked,
} from "./t3team-projectBacklogUtils";
import type { ProjectTicket } from "./t3team-types";

export type ProjectBacklogEstimatePresentation = {
  readonly label: string;
  readonly editable: boolean;
  readonly numericValue?: number;
  readonly valueText: string;
  readonly valueSuffix: "H" | "SP";
  readonly tooltip?: ProjectBacklogEstimateTooltip;
  readonly tooltipText?: string;
};

export type ProjectBacklogEstimateTooltip = {
  readonly title: string;
  readonly formula: string;
  readonly detailRows: readonly ProjectBacklogEstimateTooltipDetail[];
  readonly note?: string;
};

export type ProjectBacklogEstimateTooltipDetail = {
  readonly label: string;
  readonly value: string;
};

function formatNumericValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatHoursFromSeconds(seconds: number | undefined): string | undefined {
  if (seconds === undefined) {
    return undefined;
  }

  return `${formatNumericValue(Math.round((seconds / 3600) * 100) / 100)}h`;
}

function deriveHourEstimateValue(ticket: ProjectTicket): number | undefined {
  if (ticket.timeOriginalEstimateSeconds !== undefined) {
    return Math.round((ticket.timeOriginalEstimateSeconds / 3600) * 100) / 100;
  }

  return typeof ticket.estimateValue === "number" ? ticket.estimateValue : undefined;
}

const STORY_POINT_HOURS = 8;
const STORY_POINT_SECONDS = STORY_POINT_HOURS * 3600;

function roundStoryPointSummary(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveActiveStorySummaryPoints(ticket: ProjectTicket): number | undefined {
  const aggregateRemaining = ticket.aggregateTimeRemainingEstimateSeconds;

  if (aggregateRemaining === undefined || aggregateRemaining <= 0) {
    return undefined;
  }

  return roundStoryPointSummary(aggregateRemaining / STORY_POINT_SECONDS);
}

function buildStorySummaryTooltip(
  ticket: ProjectTicket,
  storyPointsLabel: string,
  summarizedStoryPoints: number,
  originalStoryPoints: number,
): {
  readonly tooltip: ProjectBacklogEstimateTooltip;
  readonly tooltipText: string;
} {
  const originalHours = formatHoursFromSeconds(ticket.aggregateTimeOriginalEstimateSeconds);
  const remainingHours = formatHoursFromSeconds(ticket.aggregateTimeRemainingEstimateSeconds);
  const ownHours = formatHoursFromSeconds(ticket.timeOriginalEstimateSeconds);

  const lines = [
    `${formatNumericValue(summarizedStoryPoints)} SP is derived from the remaining hour estimate across this story and its subtasks using ${STORY_POINT_HOURS}h per SP.`,
    `Original ${storyPointsLabel.toLowerCase()}: ${formatNumericValue(originalStoryPoints)} SP.`,
  ];

  if (remainingHours && originalHours) {
    lines.push(`Remaining tracked estimate: ${remainingHours} of ${originalHours}.`);
  } else if (originalHours) {
    lines.push(`Tracked estimate total: ${originalHours}.`);
  }

  if (ownHours) {
    lines.push(`Hours estimated directly on the story: ${ownHours}.`);
  }

  const detailRows: ProjectBacklogEstimateTooltipDetail[] = [
    {
      label: `Original ${storyPointsLabel.toLowerCase()}`,
      value: `${formatNumericValue(originalStoryPoints)} SP`,
    },
    ...(remainingHours
      ? [
          {
            label: "Remaining tracked estimate",
            value: remainingHours,
          },
        ]
      : []),
    ...(originalHours
      ? [
          {
            label: "Tracked estimate total",
            value: originalHours,
          },
        ]
      : []),
    ...(ownHours
      ? [
          {
            label: "Hours on story itself",
            value: ownHours,
          },
        ]
      : []),
  ];

  return {
    tooltip: {
      title: "Derived from remaining tracked hours",
      formula: `${remainingHours ?? "0h"} remaining / ${STORY_POINT_HOURS}h per SP = ${formatNumericValue(summarizedStoryPoints)} SP`,
      detailRows,
      note: `The left value updates from remaining tracked hours. The right value stays the original ${storyPointsLabel.toLowerCase()} estimate.`,
    },
    tooltipText: lines.join(" "),
  };
}

export function getProjectTicketEstimatePresentation(
  ticket: ProjectTicket,
  options: {
    storyPointsLabel?: string;
  } = {},
): ProjectBacklogEstimatePresentation {
  const storyPointsLabel = options.storyPointsLabel ?? "Story Points";
  const numericValue = typeof ticket.estimateValue === "number" ? ticket.estimateValue : undefined;
  const issueType = getProjectTicketIssueTypeKey(ticket);
  const isStory = issueType.includes("story");

  if (isProjectTicketHourTracked(ticket)) {
    const hourNumericValue = deriveHourEstimateValue(ticket);

    return {
      label: "Hours",
      editable: true,
      ...(hourNumericValue !== undefined ? { numericValue: hourNumericValue } : {}),
      valueText: hourNumericValue !== undefined ? formatNumericValue(hourNumericValue) : "",
      valueSuffix: "H",
    };
  }

  const summarizedStoryPoints =
    isStory && ticket.sprintState?.toLowerCase() === "active" && numericValue !== undefined
      ? deriveActiveStorySummaryPoints(ticket)
      : undefined;

  if (summarizedStoryPoints !== undefined && numericValue !== undefined) {
    const storySummaryTooltip = buildStorySummaryTooltip(
      ticket,
      storyPointsLabel,
      summarizedStoryPoints,
      numericValue,
    );

    return {
      label: storyPointsLabel,
      editable: false,
      numericValue,
      valueText: `${formatNumericValue(summarizedStoryPoints)}/${formatNumericValue(numericValue)}`,
      valueSuffix: "SP",
      tooltip: storySummaryTooltip.tooltip,
      tooltipText: storySummaryTooltip.tooltipText,
    };
  }

  return {
    label: storyPointsLabel,
    editable: true,
    ...(numericValue !== undefined ? { numericValue } : {}),
    valueText: numericValue !== undefined ? formatNumericValue(numericValue) : "",
    valueSuffix: "SP",
  };
}
