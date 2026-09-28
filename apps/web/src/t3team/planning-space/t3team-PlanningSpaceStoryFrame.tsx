/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The story "frame" node rendered into the planning space stage — the §3.3 card
 * that band-CSS reveals progressively (dot → card → subtask grid). Memoized on
 * the story identity plus whether the assign affordance touches it. Extracted
 * from t3team-PlanningSpaceView.tsx.
 */

import { Minus, Plus } from "lucide-react";
import { memo } from "react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";

import { steppedHours } from "./t3team-planningSpaceScene";
import {
  type PlanningStoryFrameProps,
  arePlanningStoryFramePropsEqual,
} from "./t3team-planningSpaceStoryFrameEqual";
import {
  PLANNING_STATE_COLOR,
  formatHours,
  initialsOf,
  ownerColor,
} from "./t3team-planningSpaceViewConstants";

export const PlanningStoryFrame = memo(function PlanningStoryFrame({
  story,
  color,
  frameRef,
  assignTarget,
  onSetSubtaskHours,
  onContextMenu,
}: PlanningStoryFrameProps) {
  const stateColor = PLANNING_STATE_COLOR[story.planningState];
  const storyAffordanceActive = assignTarget?.kind === "story" && assignTarget.storyId === story.id;
  return (
    <div
      ref={frameRef}
      data-t3ps="node"
      data-node-id={story.id}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, story.id) : undefined}
    >
      <div data-t3ps="inner">
        <span data-t3ps="dot" style={{ background: stateColor }} title={story.title} />
        <div
          className={`rounded-lg border bg-background/95 ${
            story.isContextParent || story.isPlaceholder ? "border-dashed opacity-90" : ""
          } ${story.resolved ? "opacity-60" : ""}`}
          data-t3ps="card"
          style={{ borderColor: `${color}55` }}
          title={story.title}
        >
          <div className="flex min-w-0 cursor-pointer items-center gap-1.5" data-t3ps="header">
            <JiraIssueTypeIcon
              issueType={story.issueType}
              issueTypeIconUrl={story.issueTypeIconUrl ?? undefined}
            />
            <span className="truncate font-mono text-3xs text-muted-foreground">{story.key}</span>
            {story.isContextParent ? (
              <span className="rounded border border-dashed border-muted-foreground/50 px-1 text-4xs text-muted-foreground">
                context
              </span>
            ) : null}
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 text-3xs tabular-nums text-primary">
              {story.aggregateHoursSeconds > 0
                ? `Σ ${formatHours(story.aggregateHoursSeconds)}`
                : formatHours(story.ownHoursSeconds)}
            </span>
            <button
              type="button"
              data-owner-affordance="true"
              data-story-id={story.id}
              className={`flex size-4 shrink-0 items-center justify-center rounded-full text-5xs font-medium text-background ${
                storyAffordanceActive ? "ring-2 ring-primary" : ""
              }`}
              data-t3ps="avatar"
              style={{
                background: story.ownerName ? stateColor : "transparent",
                border: story.ownerName ? "none" : "1px dashed currentColor",
                color: story.ownerName ? undefined : "inherit",
              }}
              title={
                story.ownerName
                  ? `${story.ownerName} — click to reassign`
                  : "Unassigned — click to assign"
              }
            >
              {story.ownerName ? initialsOf(story.ownerName) : "+"}
            </button>
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-snug text-foreground" data-t3ps="title">
            {story.title}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-0.75" data-t3ps="subdots">
            {story.subtasks.map((subtask) => (
              <span
                key={subtask.id}
                className="size-1.5 rounded-full"
                style={{
                  background: subtask.ownerName ? ownerColor(subtask.ownerId ?? "") : "#8a8a93",
                  opacity: subtask.resolved ? 0.3 : 1,
                }}
                title={`${subtask.title} — ${
                  subtask.ownerName ?? "unassigned"
                } · ${formatHours(subtask.hoursSeconds)}`}
              />
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5" data-t3ps="subgrid">
            {story.subtasks.map((subtask) => {
              const subAffordanceActive =
                assignTarget?.kind === "subtask" && assignTarget.subtaskId === subtask.id;
              return (
                <div
                  key={subtask.id}
                  data-subtask-id={subtask.id}
                  className={`cursor-pointer rounded-md border border-border/70 bg-muted/30 px-1.5 py-1 hover:border-primary/50 ${
                    subtask.resolved ? "opacity-50" : ""
                  }`}
                  title={subtask.title}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-ps-chrome="true"
                      aria-label="Decrease estimate"
                      className="hidden size-3.5 items-center justify-center rounded border border-border/60 text-3xs text-muted-foreground hover:text-foreground"
                      data-t3ps="substep"
                      onClick={() =>
                        onSetSubtaskHours(subtask.id, steppedHours(subtask.hoursSeconds, -1))
                      }
                    >
                      <Minus className="size-2.5" />
                    </button>
                    <span className="rounded bg-primary/10 px-1 text-4xs tabular-nums text-primary">
                      {formatHours(subtask.hoursSeconds)}
                    </span>
                    <button
                      type="button"
                      data-ps-chrome="true"
                      aria-label="Increase estimate"
                      className="hidden size-3.5 items-center justify-center rounded border border-border/60 text-3xs text-muted-foreground hover:text-foreground"
                      data-t3ps="substep"
                      onClick={() =>
                        onSetSubtaskHours(subtask.id, steppedHours(subtask.hoursSeconds, 1))
                      }
                    >
                      <Plus className="size-2.5" />
                    </button>
                    <button
                      type="button"
                      data-owner-affordance="true"
                      data-story-id={story.id}
                      data-subtask-id={subtask.id}
                      className={`ml-auto size-2.5 shrink-0 rounded-full ${
                        subAffordanceActive ? "ring-2 ring-primary" : ""
                      }`}
                      style={{
                        background: subtask.ownerName
                          ? ownerColor(subtask.ownerId ?? "")
                          : "transparent",
                        border: subtask.ownerName ? "none" : "1px dashed #8a8a93",
                      }}
                      title={
                        subtask.ownerName
                          ? `${subtask.ownerName} — click to reassign`
                          : "Unassigned — click to assign"
                      }
                    />
                  </div>
                  <div
                    className="mt-0.5 truncate text-3xs leading-tight text-foreground/80"
                    data-t3ps="subtitle"
                  >
                    {subtask.title}
                  </div>
                </div>
              );
            })}
            {story.subtasks.length === 0 ? (
              <div className="col-span-2 px-1 py-0.5 text-3xs text-muted-foreground">
                No subtasks yet — planning starts here.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}, arePlanningStoryFramePropsEqual);
