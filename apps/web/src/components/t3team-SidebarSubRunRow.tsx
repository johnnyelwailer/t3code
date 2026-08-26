import { CircleCheckIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { ScopedThreadRef } from "@t3tools/contracts";
import { formatRelativeTimeLabel } from "../timestampFormat";
import type { ProjectThread } from "~/t3team/t3team-types";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";
import { usePrimarySettings } from "~/hooks/useSettings";
import { ThreadActivityMorphIcon } from "./ThreadActivityStatus";
import { cn } from "~/lib/utils";

/**
 * Compact time label for the dense sidebar rows: "just now" → "now",
 * "5m ago" → "5m". Shared by the parent thread rows (Sidebar.tsx) and the
 * sub-run rows below so parent and child read the same clock.
 */
export function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

/**
 * t3team: one-line row for a sub-runbook child thread (Epic: first-class
 * sub-runbooks, tree v2). Rendered directly below its parent's row when the
 * parent's "N sub-runs" chip is expanded (`InboxSubRunsChip`) — never in the
 * flat row list itself, per `useT3TeamChildThreadRelations`'s orphan rule.
 * Compact but same-status-language as the parent card: a running sub-run
 * shows the parent's ring icon (sm variant) plus the same live status
 * summary (state word · detail), docked on the right when it fits or
 * flipped into the title slot when it doesn't.
 */
export const SidebarSubRunRow = memo(function SidebarSubRunRow(props: {
  child: ProjectThread;
  childRef: ScopedThreadRef;
  isActive: boolean;
  onNavigate: () => void;
  onContextMenu: (threadRef: ScopedThreadRef, position: { x: number; y: number }) => void;
}) {
  const { child } = props;
  // GHE #40/#208: child rows carry the SAME live status summary as their
  // parent card — the deterministic state word, with the LLM detail
  // appended only while the activity-label flag is on. The derivation is
  // the parent's verbatim (resolveActivityPillDisplay over the same
  // fields), so a sub-run and its parent never disagree about what is
  // happening.
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );
  const childLabel =
    child.status === "running"
      ? resolveActivityPillDisplay({
          label: "Working",
          ...(child.activityState && child.activityState !== null
            ? { activityState: child.activityState }
            : {}),
          ...(activityLabelsEnabled && child.activityLabel
            ? { activityLabel: child.activityLabel }
            : {}),
        })
      : undefined;
  const subRowRef = useRef<HTMLButtonElement>(null);
  const subSizersRef = useRef<HTMLSpanElement>(null);
  const [childLabelMode, setChildLabelMode] = useState<"dock" | "flip" | null>(null);
  useLayoutEffect(() => {
    const row = subRowRef.current;
    const sizers = subSizersRef.current;
    if (!row || !sizers || childLabel === undefined) {
      setChildLabelMode(null);
      return;
    }
    const label = sizers.querySelector<HTMLElement>("[data-sizer='__label']");
    const time = sizers.querySelector<HTMLElement>("[data-sizer='__time']");
    const w = row.getBoundingClientRect().width;
    // row chrome: ps inset 24px + pe 10px + status ring 12px + 3 × gap 6px
    const avail = w - 24 - 10 - 12 - 18 - (time ? time.offsetWidth : 0);
    const labelW = label ? label.offsetWidth : 0;
    setChildLabelMode(labelW <= avail ? "dock" : "flip");
  }, [childLabel, child.title, child.lastMessageAt]);
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      props.onContextMenu(props.childRef, { x: event.clientX, y: event.clientY });
    },
    [props.childRef, props.onContextMenu],
  );
  // GHE #40: a running sub-run carries the parent card's ring icon (sm
  // variant of ThreadActivityMorphIcon, same dashed-ring language, no
  // forked status chrome); settled/error/idle keep their compact marks.
  const statusIcon =
    child.status === "running" ? (
      <span className="shrink-0 text-sky-600 dark:text-sky-400">
        <ThreadActivityMorphIcon solid={false} size="sm" pulse />
      </span>
    ) : child.status === "error" ? (
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" />
    ) : child.status === "completed" ? (
      <CircleCheckIcon aria-hidden className="size-3 shrink-0 text-sidebar-muted-foreground/70" />
    ) : (
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-sidebar-muted-foreground/40" />
    );
  return (
    <li role="presentation" className="list-none">
      <button
        type="button"
        ref={subRowRef}
        onClick={props.onNavigate}
        onContextMenu={handleContextMenu}
        aria-current={props.isActive ? "page" : undefined}
        className={cn(
          "relative flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md pe-2.5 ps-[calc(var(--sidebar-content-inset)+1rem)] text-left text-xs outline-none",
          props.isActive
            ? "bg-sidebar-row-active text-sidebar-foreground"
            : "text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
      >
        {statusIcon}
        <span
          className="min-w-0 flex-1 truncate"
          title={childLabelMode === "flip" ? child.title : undefined}
        >
          {childLabelMode === "flip" ? (
            <span className="t3team-label-shimmer">{childLabel}</span>
          ) : (
            child.title
          )}
        </span>
        {childLabelMode === "dock" ? (
          <span className="shrink-0 text-sky-600 dark:text-sky-400">
            <span className="t3team-label-shimmer">{childLabel}</span>
          </span>
        ) : null}
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground/55 tabular-nums">
          {compactSidebarTimeLabel(formatRelativeTimeLabel(child.lastMessageAt))}
        </span>
        {/* sizers for the dock/flip decision (natural widths, hidden) */}
        {childLabel !== undefined ? (
          <span
            ref={subSizersRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
          >
            <span data-sizer="__label" className="inline-block whitespace-nowrap">
              {childLabel}
            </span>
            <span data-sizer="__time" className="inline-block whitespace-nowrap text-[0.6875rem]">
              {compactSidebarTimeLabel(formatRelativeTimeLabel(child.lastMessageAt))}
            </span>
          </span>
        ) : null}
      </button>
    </li>
  );
});
