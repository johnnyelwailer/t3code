import { WorkLogButton, WorkLogList, WorkLogRow } from "./WorkLog";
import type { WorktreeSetupSnapshot } from "@t3tools/contracts";
import {
  getQuestionAnswerPreview,
  getQuestionTextPreview,
  hasQuestionAnswer,
} from "@t3tools/client-runtime/work-log/user-input";
import { type ToolActivityIcon } from "@t3tools/contracts";
import { liveThoughtLine } from "@t3tools/client-runtime/work-log/presentation";
import { resolveWorkGroupScrollAnchor } from "@t3tools/client-runtime/work-log/scroll-anchor";
import { observeResize } from "~/lib/observeResize";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { memo, use, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { workEntryDisplayIndicatesToolFailure } from "../../session-logic";
import ChatMarkdown from "../ChatMarkdown";
import { Minimize2Icon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import {
  liveWorkEntryLabel,
  resolveWorkGroupScrollIndex,
  shouldFollowWorkGroupAppend,
  workEntryIsVisibleInGroup,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { WorktreeSetupCard } from "./WorktreeSetupCard";
import { cn } from "~/lib/utils";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  TimelineRowCtx,
  TimelineRowActivityCtx,
  WorkGroupViewCtx,
  type TimelineWorkEntry,
  type TimelineRow,
} from "./timelineRowContext";
import { TimelineRowTimestamp, ActivityShimmerOverlay } from "./TimelineRowParts";
import { WorkingLeadText } from "~/t3team/chat/t3team-workingLeadText";
import { T3TeamActiveAgentsIndicator } from "~/t3team/chat/t3team-activeAgentsIndicator";
import { T3TeamActiveAgentsStepLabel } from "~/t3team/chat/t3team-activeAgentsStepLabel";
import {
  ACTIVITY_STATE_WORDS,
  resolveActivityPillDisplay,
} from "~/t3team/t3team-activityStateDisplay";
import {
  BackgroundJobRunningBadge,
  BackgroundJobsRunningIndicator,
} from "./BackgroundJobsIndicator";
import {
  failedToolIconClassName,
  toolIconAcceptsTint,
  type WorkEntryIconName,
  ToolActivityIconView,
} from "./TimelineToolActivityIcon";
import {
  useThreadReadTarget,
  threadReadLabel,
  ThreadReadLabel,
  ReasoningTraceContent,
  SimpleWorkEntryRow,
} from "./TimelineWorkEntryRow";
import {
  remarkThoughtPreview,
  toolGroupSummaryIconName,
  workEntryIconName,
} from "./TimelineWorkEntryRow.logic";

export const WorkGroupSection = memo(function WorkGroupSection({
  anchorKey,
  disclosureAnchorKey = anchorKey,
  groupedEntries,
  isExpandedToolGroup,
  displayLabel,
}: {
  anchorKey: string;
  disclosureAnchorKey?: string;
  groupedEntries: Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"];
  isExpandedToolGroup: boolean;
  displayLabel?: string | undefined;
}) {
  const { workspaceRoot, routeThreadKey, onToggleWorkEntry } = use(TimelineRowCtx);
  const onToggleStandaloneEntry = (collapsed: boolean) =>
    onToggleWorkEntry(disclosureAnchorKey, collapsed);
  const nonEmptyEntries = groupedEntries.filter((entry) =>
    workEntryIsVisibleInGroup(entry, isExpandedToolGroup),
  );

  if (nonEmptyEntries.length === 0) return null;
  if (isExpandedToolGroup && nonEmptyEntries.every((entry) => entry.itemType === "reasoning")) {
    return <ReasoningTraceContent entries={nonEmptyEntries} />;
  }
  if (isExpandedToolGroup) {
    return (
      <ExpandedWorkGroupEntries
        key={`${routeThreadKey}:${anchorKey}`}
        anchorKey={anchorKey}
        disclosureAnchorKey={disclosureAnchorKey}
        entries={nonEmptyEntries}
        workspaceRoot={workspaceRoot}
      />
    );
  }

  return (
    <section aria-label="Activity">
      {nonEmptyEntries.map((workEntry) => (
        <SimpleWorkEntryRow
          key={workEntry.id}
          workEntry={workEntry}
          workspaceRoot={workspaceRoot}
          displayLabel={displayLabel}
          onToggleEntry={onToggleStandaloneEntry}
        />
      ))}
    </section>
  );
});

const compactWorkEntryHeight = 24;

function ExpandedWorkGroupEntries({
  anchorKey,
  disclosureAnchorKey,
  entries,
  workspaceRoot,
}: {
  anchorKey: string;
  disclosureAnchorKey: string;
  entries: TimelineWorkEntry[];
  workspaceRoot: string | undefined;
}) {
  const { workGroupViewState: viewState, onToggleWorkEntry } = use(TimelineRowCtx);
  const [initialScrollIndex] = useState(() =>
    resolveWorkGroupScrollIndex(entries, viewState.scrollPositions.get(anchorKey)),
  );
  const [restoringPosition, setRestoringPosition] = useState(initialScrollIndex !== undefined);
  const listRef = useRef<LegendListRef>(null);
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);
  const [fades, setFades] = useState({ top: false, bottom: false, viewportHeight: 0 });
  const [appendState, setAppendState] = useState({ entries, follow: false });
  // Capture the pre-change edge once per incoming array, before new layout
  // metrics arrive. Edge/viewport changes never turn a status update into a follow.
  if (appendState.entries !== entries) {
    setAppendState({
      entries,
      follow:
        fades.viewportHeight > 0 &&
        shouldFollowWorkGroupAppend(appendState.entries, entries, fades.bottom ? Infinity : 0),
    });
  }

  const groupView = {
    state: viewState,
    onToggleEntry: (collapsed: boolean) => onToggleWorkEntry(disclosureAnchorKey, collapsed),
  };
  const updateScrollFades = () => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    const distanceFromEnd = element.scrollHeight - element.clientHeight - element.scrollTop;
    const viewportHeight = element.clientHeight;
    const top = element.scrollTop > 1;
    const bottom = distanceFromEnd > 1;
    setFades((previous) =>
      previous.top === top &&
      previous.bottom === bottom &&
      previous.viewportHeight === viewportHeight
        ? previous
        : { top, bottom, viewportHeight },
    );
  };

  const handleScroll = () => {
    const state = listRef.current?.getState();
    const position = state && resolveWorkGroupScrollAnchor(state);
    if (position) {
      viewState.scrollPositions.set(anchorKey, {
        entryId: position.rowId,
        offset: position.offsetWithinRow,
      });
    }
    updateScrollFades();
  };

  const handleLoad = () => {
    const list = listRef.current;
    const element = list?.getScrollableNode();
    if (initialScrollIndex && list && element) {
      // Bootstrap can report the restored target before the DOM has applied it.
      // Reconcile once at load, before releasing the measured anchor row.
      const offset = Math.max(
        0,
        Math.min(list.getState().scroll, element.scrollHeight - element.clientHeight),
      );
      if (Math.abs(element.scrollTop - offset) > 1) {
        void list.scrollToOffset({ offset, animated: false });
      }
    }
    setRestoringPosition(false);
  };

  useLayoutEffect(() => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    updateScrollFades();
    const content = element.firstElementChild;
    return observeResize(content ? [element, content] : element, updateScrollFades);
  }, [updateScrollFades]);

  const renderEntry = ({ item }: { item: TimelineWorkEntry }) => (
    <SimpleWorkEntryRow key={item.id} workEntry={item} workspaceRoot={workspaceRoot} />
  );

  const updateExpandedContentHeight = () => {
    const state = listRef.current?.getState();
    let height = 0;
    for (const entryId of viewState.expandedEntries) {
      if (state?.indexByKey(entryId) === undefined) continue;
      height += Math.max(
        0,
        (state.sizes.get(entryId) ?? compactWorkEntryHeight) - compactWorkEntryHeight,
      );
    }
    setExpandedContentHeight(height);
  };

  useLayoutEffect(updateExpandedContentHeight, [entries, updateExpandedContentHeight]);

  return (
    <WorkGroupViewCtx value={groupView}>
      <WorkLogList>
        <LegendList
          ref={listRef}
          data={entries}
          extraData={workspaceRoot}
          keyExtractor={workEntryKey}
          renderItem={renderEntry}
          estimatedItemSize={compactWorkEntryHeight}
          drawDistance={240}
          recycleItems
          {...(initialScrollIndex ? { initialScrollIndex } : {})}
          maintainScrollAtEnd={
            appendState.follow ? { animated: false, on: { dataChange: true } } : false
          }
          maintainScrollAtEndThreshold={1 / Math.max(1, fades.viewportHeight)}
          // Measure the restored row even when an intra-row offset puts its
          // estimated bounds outside the list's small bootstrap render window.
          {...(restoringPosition && initialScrollIndex
            ? { alwaysRender: { indices: [initialScrollIndex.index] } }
            : {})}
          maintainVisibleContentPosition
          onLoad={handleLoad}
          onScroll={handleScroll}
          onLayout={updateScrollFades}
          onItemSizeChanged={updateExpandedContentHeight}
          tabIndex={0}
          role="region"
          aria-label="Tool calls"
          data-tool-group-scroll
          style={{ maxHeight: `calc(min(18rem, 50dvh) + ${expandedContentHeight}px)` }}
          className={cn(
            "scrollbar-gutter-stable scroll-py-6 overflow-x-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            getVirtualizedScrollFadeClassName(fades),
          )}
        />
      </WorkLogList>
    </WorkGroupViewCtx>
  );
}

const workEntryKey = (entry: TimelineWorkEntry) => entry.id;

export function WorkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "working" }> }) {
  const { threadRef, threadJobsController } = use(TimelineRowCtx);
  const {
    isWorking,
    isCompacting,
    isPreparingWorktree,
    workingStepLabel,
    activeAgents,
    backgroundJobs,
    onOpenAgents,
    onOpenAgent,
    threadActivityState,
    threadActivityLabel,
    liveReasoningTrace,
    backgroundWorktreeSetup,
  } = use(TimelineRowActivityCtx);
  const compacting = row.compacting ?? (isCompacting ? "Compacting…" : undefined);
  if (isPreparingWorktree || compacting !== undefined) {
    return (
      <div className="border-b border-border/60 pb-2 pt-1">
        <div className="flex h-6 min-w-0 items-baseline px-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
          <span
            key={isPreparingWorktree ? "setup" : "compacting"}
            ref={observeVisibleAnimation}
            className="relative shrink-0 overflow-hidden whitespace-nowrap transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none"
          >
            {isPreparingWorktree ? (
              <>
                Setting up worktree…
                <ActivityShimmerOverlay>Setting up worktree…</ActivityShimmerOverlay>
              </>
            ) : (
              <>
                <CompactingLabel label={compacting ?? "Compacting…"} />
                <ActivityShimmerOverlay>
                  <CompactingLabel label={compacting ?? "Compacting…"} />
                </ActivityShimmerOverlay>
              </>
            )}
          </span>
        </div>
      </div>
    );
  }
  const hasActiveAgents = activeAgents.length > 0;
  const waitingForAgents = !isWorking && hasActiveAgents;
  // A backgrounded bash job outlives its turn, so the row can be here for
  // the job alone. Then the status line has nothing true to say — there is
  // no active turn and no agent — and the job line IS the row. Rendering it
  // alone (not as a second line under a stale "Working") also means the row
  // disappears cleanly: the indicator returns null once the last job settles
  // or passes its hard deadline, and it takes the whole row with it.
  if (!isWorking && !hasActiveAgents) {
    return (
      <div data-t3team-working-row>
        <BackgroundJobsRunningIndicator
          jobs={backgroundJobs}
          {...(threadRef !== null ? { threadId: threadRef.threadId } : {})}
          {...(threadJobsController !== undefined ? { controller: threadJobsController } : {})}
          className="border-b border-border/60 px-1 pb-2 pt-1"
        />
      </div>
    );
  }
  // GHE #236/#208/#40: the shared resolver (same seam as the sidebar) picks
  // the lead word: the LLM activity label REPLACES the deterministic state
  // word, which replaces the base word. The base word: a turn STARTS
  // thinking (the server persists `thinking` on turn-started), so an
  // ACTIVE turn with no live state yet reads "Thinking" — "Working"
  // remains only when no active-turn info exists at all (old servers).
  const liveState = threadActivityState !== null && threadActivityState !== undefined;
  const baseWord = liveState
    ? ACTIVITY_STATE_WORDS[threadActivityState]
    : isWorking
      ? "Thinking"
      : "Working";
  const leadWord = resolveActivityPillDisplay({
    label: baseWord,
    activityLabel: threadActivityLabel ?? null,
    activityState: threadActivityState ?? null,
  });
  // The native reasoning trace owns the live "Thinking" surface while it is
  // visible for this turn; the working row then says "Working" instead of a
  // second "Thinking" (owner dedup). Other state words are unaffected.
  const shownLeadWord = leadWord === "Thinking" && liveReasoningTrace ? "Working" : leadWord;
  return (
    <div data-t3team-working-row>
      <div className="border-b border-border/60 pb-2 pt-1">
        {/* GHE #238: single-line, no wrap. The row is a flex line; the step
            label is the primary shrink/truncate point (it clips internally
            via .t3team-aci-step). The dots never shrink; the lead span is
            the last-resort shrink point (narrow panels — see below).
            GHE #236 follow-up: items-CENTER, not baseline — the lead's
            clamp span is overflow-hidden, which by spec has NO text
            baseline, so baseline alignment pinned the lead's line-box
            BOTTOM to the row baseline and left the status text riding ~3px
            above the agent dots (with dead space below it). Centering puts
            the glyph centers and the dot centers on the same line.
            The clamp itself must be a flex row (below): as a block it lays
            out the inline-block slot in a LINE BOX whose strut overhangs
            the slot's baseline by ~6px, inflating the row to 29px and
            pinning the status text ~3px above the centered dots. As a
            flex row the slot is a flex item (no line box), the row stays
            22.75px tall, and everything centers on one line. */}
        <div className="flex items-center px-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
          {/* GHE #208 follow-up: the step label stays the PRIMARY shrink
              point; the lead span is the LAST-RESORT one — only when the
              panel is narrower than the lead itself does the timer text
              ellipsize (the .t3team-aci-lead clamp) instead of hard-clipping
              at the row wrapper's overflow-x-clip. The row stays one line,
              no wrap, no second line. */}
          {waitingForAgents ? null : (
            <span className="flex min-w-0 items-center">
              {/* GHE #236 follow-up: no leading dot pulses — the status
                  text alone leads the row; child chips on the right carry
                  each agent's driver and status word. */}
              {/* The shimmer paint lives on the LEAF text spans inside
                  WorkingLeadText (background-clip: text cannot reach text
                  in nested animated spans through this wrapper — P0).
                  This span is pure layout: the last-resort clamp. FLEX, not
                  block — a block here lays the inline-block slot out in a
                  line box whose strut overhangs the slot baseline, and the
                  inflated 29px box makes the status text ride ~3px above
                  the chips (measured on the GHE #201 alignment story).
                  text-overflow is dead CSS on a flex container; the SLOT
                  (.t3team-aci-lead) owns overflow + ellipsis. */}
              <span className="flex min-w-0 items-center overflow-hidden">
                {row.createdAt ? (
                  <>
                    <WorkingLeadText
                      stateWord={shownLeadWord}
                      createdAt={row.createdAt}
                      liveState={liveState}
                      shimmer
                    />
                  </>
                ) : (
                  <span className="t3team-label-shimmer">{`${shownLeadWord}...`}</span>
                )}
              </span>
            </span>
          )}
          {hasActiveAgents ? (
            <T3TeamActiveAgentsIndicator
              entries={activeAgents}
              onOpenAgents={onOpenAgents}
              onOpenAgent={onOpenAgent}
              className={waitingForAgents ? "ml-auto" : undefined}
            />
          ) : null}
          {hasActiveAgents && isWorking ? (
            <T3TeamActiveAgentsStepLabel label={workingStepLabel} />
          ) : !hasActiveAgents && workingStepLabel ? (
            // GHE #208 follow-up: the step label is the PRIMARY shrink
            // point — with shrink-100 it surrenders nearly all the row's
            // overflow, so a narrow panel truncates (then vanishes) the
            // step before the timer text ever ellipsizes.
            <span className="ml-2 min-w-0 shrink-100 truncate text-muted-foreground/55">
              {workingStepLabel}
            </span>
          ) : null}
          {backgroundWorktreeSetup ? (
            <BackgroundWorktreeSetupChip snapshot={backgroundWorktreeSetup} />
          ) : null}
        </div>
        {/* A job started in an earlier turn keeps running through this one, so
            the job line sits under the status line rather than replacing it.
            It renders nothing when no job is running. */}
        <BackgroundJobsRunningIndicator
          jobs={backgroundJobs}
          {...(threadRef !== null ? { threadId: threadRef.threadId } : {})}
          {...(threadJobsController !== undefined ? { controller: threadJobsController } : {})}
          className="px-1"
        />
      </div>
    </div>
  );
}

function BackgroundWorktreeSetupChip({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  const ctx = use(TimelineRowCtx);
  const terminalId = snapshot.setupScript?.terminalId ?? null;
  const openTerminal = ctx.onOpenWorktreeSetupTerminal;
  const onOpenTerminal = openTerminal && terminalId ? () => openTerminal(terminalId) : null;
  const scriptName = snapshot.setupScript?.name ?? "Setup script";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost-muted"
            size="micro"
            className="ml-auto min-w-0 shrink-0"
            aria-label={`Background setup is still running: ${scriptName}. Show setup progress.`}
          />
        }
      >
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">Background setup</span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="end" width="lg" padding="compact">
        <WorktreeSetupCard
          snapshot={snapshot}
          embedded
          onCancel={null}
          onWorkLocally={null}
          onOpenTerminal={onOpenTerminal}
        />
      </PopoverPopup>
    </Popover>
  );
}

function CompactingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Minimize2Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}

export function ThinkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "thinking" }> }) {
  const ctx = use(TimelineRowCtx);
  const { isCompacting, isPreparingWorktree } = use(TimelineRowActivityCtx);
  if (isPreparingWorktree || isCompacting) return <WorkLogRow label="" />;
  const activity = <LiveActivityRow label="Thinking" iconName="brain" active shimmer />;
  const { groupId } = row;
  if (groupId === undefined) return activity;
  return (
    <button
      type="button"
      className="group/live-work flex min-h-6 w-full max-w-full cursor-pointer items-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      aria-expanded={row.expanded === true}
      onClick={() => ctx.onToggleWorkGroup(groupId, row.id)}
    >
      {activity}
    </button>
  );
}

function LiveActivityRow({
  label,
  iconName,
  toolIcon,
  failed = false,
  active = false,
  shimmer = false,
}: {
  label: ReactNode;
  iconName?: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  active?: boolean;
  shimmer?: boolean;
}) {
  const animated = active && !failed;
  const showShimmer = animated && shimmer;
  return (
    <div
      ref={animated ? observeVisibleAnimation : undefined}
      className="relative min-h-6 w-fit max-w-full min-w-0 overflow-hidden rounded-md text-sm leading-relaxed"
    >
      <LiveActivityContent
        label={label}
        iconName={iconName}
        toolIcon={toolIcon}
        failed={failed}
        announceFailure={failed}
        active={animated && !shimmer}
      />
      {showShimmer ? (
        <ActivityShimmerOverlay>
          <LiveActivityContent label={label} iconName={iconName} toolIcon={toolIcon} highlighted />
        </ActivityShimmerOverlay>
      ) : null}
    </div>
  );
}

function LiveActivityContent({
  label,
  iconName,
  toolIcon,
  failed = false,
  announceFailure = false,
  active = false,
  highlighted = false,
}: {
  label: ReactNode;
  iconName: WorkEntryIconName | undefined;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  announceFailure?: boolean;
  active?: boolean;
  highlighted?: boolean;
}) {
  const showTrailingFailureMark =
    failed && iconName !== undefined && !toolIconAcceptsTint(toolIcon);

  return (
    <WorkLogRow
      icon={
        iconName ? (
          <span
            className={cn(
              "flex size-4 items-center justify-center",
              failed
                ? failedToolIconClassName
                : highlighted
                  ? "text-foreground"
                  : "text-icon-muted",
            )}
            role={announceFailure ? "img" : undefined}
            aria-label={announceFailure ? "Tool call failed" : undefined}
          >
            <ToolActivityIconView
              icon={toolIcon}
              fallbackName={iconName}
              className="block size-4 shrink-0 stroke-2"
              muted={!highlighted}
            />
          </span>
        ) : null
      }
      label={
        <span
          className={cn(
            "block truncate",
            highlighted && "text-foreground",
            active && "live-tool-shine",
          )}
        >
          {label}
        </span>
      }
      trailing={
        showTrailingFailureMark ? (
          <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
        ) : null
      }
    />
  );
}

export function LiveWorkEntryTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-live" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const threadTarget = useThreadReadTarget(row.entry, ctx.activeThreadEnvironmentId);
  const questionHeading = row.entry.questionAnswer
    ? getQuestionTextPreview(row.entry.questionAnswer)
    : "";
  const label = questionHeading || liveWorkEntryLabel(row.entry, ctx.workspaceRoot, row.active);
  const threadLabel = threadReadLabel(label, threadTarget);

  const failed = workEntryDisplayIndicatesToolFailure(row.entry);
  const thoughtLine = row.thought && !row.expanded ? liveThoughtLine(row.thought.detail ?? "") : "";
  const thoughtIsStatus = thoughtLine !== "" && row.entry === row.thought;

  return (
    <button
      type="button"
      className={cn(
        "group/live-work flex w-full max-w-full cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        thoughtLine ? "flex-col items-start" : "min-h-6 items-center",
      )}
      aria-label={
        failed
          ? `${thoughtLine ? `${thoughtLine} ` : ""}${threadLabel?.text ?? label}, tool call failed`
          : undefined
      }
      aria-expanded={row.expanded}
      onClick={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
    >
      {thoughtLine ? (
        <WorkLogRow
          icon={
            <span className="flex size-4 items-center justify-center text-icon-muted">
              <ToolActivityIconView
                icon={undefined}
                fallbackName="brain"
                className="block size-4 shrink-0 stroke-2"
                muted
              />
            </span>
          }
          label={
            <span className="line-clamp-4">
              <ChatMarkdown
                inline
                text={thoughtLine}
                cwd={ctx.markdownCwd}
                parseRawHtml={false}
                extraRemarkPlugins={[[remarkThoughtPreview, "Thought"]]}
              />
            </span>
          }
          wrapLabel
        />
      ) : null}
      <LiveActivityRow
        label={
          thoughtIsStatus ? (
            row.active ? (
              "Thinking"
            ) : (
              "Thought"
            )
          ) : row.entry.questionAnswer && hasQuestionAnswer(row.entry.questionAnswer) ? (
            <span className="flex min-w-0 gap-1.5">
              <span className="min-w-0 truncate">{label}</span>
              <span className="min-w-0 truncate text-foreground">
                {getQuestionAnswerPreview(row.entry.questionAnswer)}
              </span>
            </span>
          ) : row.entry.itemType === "reasoning" ? (
            <ChatMarkdown
              inline
              text={row.entry.detail ?? label}
              cwd={ctx.markdownCwd}
              parseRawHtml={false}
              extraRemarkPlugins={[[remarkThoughtPreview, row.active ? "Thinking" : "Thought"]]}
            />
          ) : threadLabel ? (
            <ThreadReadLabel
              label={threadLabel}
              environmentId={ctx.activeThreadEnvironmentId}
              linked={false}
            />
          ) : (
            label
          )
        }
        iconName={workEntryIconName(row.entry)}
        toolIcon={row.entry.toolIcon ?? row.entry.toolSource?.icon}
        failed={failed}
        active={row.active}
      />
    </button>
  );
}

export function WorkGroupToggleTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-toggle" }>;
}) {
  const ctx = use(TimelineRowCtx);
  // t3team: a collapsed group hides the bash row that started a job, and collapsed
  // is the default — so the summary row carries the tag (first running job only).
  const backgroundJob =
    row.backgroundJobEntryIds
      ?.map((entryId) => ctx.backgroundJobStarters.get(entryId))
      .find((job) => job !== undefined) ?? null;
  return (
    <WorkGroupHeader
      label={row.summary}
      iconName={row.summaryToolIcon ?? row.toolSurface ?? toolGroupSummaryIconName(row.summaryKind)}
      toolIcon={row.toolIcon}
      failed={row.hasFailure}
      expanded={row.expanded}
      createdAt={row.createdAt}
      timestampFormat={ctx.timestampFormat}
      onToggle={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
      badge={backgroundJob !== null ? <BackgroundJobRunningBadge job={backgroundJob} /> : null}
    />
  );
}

function WorkGroupHeader(props: {
  label: string;
  iconName: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean | undefined;
  active?: boolean | undefined;
  expanded: boolean;
  createdAt: string;
  timestampFormat: TimestampFormat;
  onToggle: () => void;
  /** t3team: trailing tag before the timestamp (background-job badge). */
  badge?: ReactNode;
}) {
  return (
    <WorkLogButton
      ref={props.active && !props.failed ? observeVisibleAnimation : undefined}
      aria-label={props.failed ? `${props.label}, tool call failed` : props.label}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      icon={
        <ToolActivityIconView
          icon={props.toolIcon}
          fallbackName={props.iconName}
          className="size-4 shrink-0 stroke-2 text-icon-muted"
          muted
        />
      }
      label={
        <span className={cn("block truncate", props.active && !props.failed && "live-tool-shine")}>
          {props.label}
        </span>
      }
      trailing={
        <>
          {props.badge}
          <TimelineRowTimestamp
            createdAt={props.createdAt}
            timestampFormat={props.timestampFormat}
          />
        </>
      }
    />
  );
}
