import { EnvironmentId } from "@t3tools/contracts";
import { createRef } from "react";
import type { LegendListRef } from "@legendapp/list/react";

export function buildT3TeamMessagesTimelineTestProps() {
  return {
    isWorking: false,
    activeTurnInProgress: false,
    activeTurnStartedAt: null,
    listRef: createRef<LegendListRef | null>(),
    latestTurn: null,
    runningTurnId: null,
    turnDiffSummaryByAssistantMessageId: new Map(),
    routeThreadKey: "environment-local:thread-1",
    onOpenTurnDiff: () => {},
    revertTurnCountByUserMessageId: new Map(),
    onRevertUserMessage: () => {},
    isRevertingCheckpoint: false,
    onImageExpand: () => {},
    activeThreadEnvironmentId: EnvironmentId.make("environment-local"),
    markdownCwd: undefined,
    resolvedTheme: "light" as const,
    timestampFormat: "locale" as const,
    workspaceRoot: undefined,
    anchorMessageId: null,
    contentInsetEndAdjustment: 0,
    // Upstream (2026-08) made live-follow an explicit prop rather than an internal default;
    // these snapshots assert rendered content, so following the live edge is the neutral value.
    liveFollowEnabled: true,
    onIsAtEndChange: () => {},
    onAnchorReady: () => {},
    onAnchorSizeChanged: () => {},
    onManualNavigation: () => {},
  };
}
