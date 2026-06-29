import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { T3workContextRefreshService } from "./t3work-contextRefreshService.ts";
import { normalizeT3workWorkspaceRoot, toT3workError } from "./t3work-project-repository-utils.ts";

type RefreshWorkItemContextRequest = {
  readonly projectId?: string;
  readonly workspaceRoot?: string;
  readonly ticketKey?: string;
  readonly force?: boolean;
};

type RefreshWorkItemSliceContextRequest = {
  readonly projectId?: string;
  readonly workspaceRoot?: string;
  readonly ticketKey?: string;
  readonly focusKind?: string;
  readonly focusLabel?: string;
  readonly summaryItems?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly force?: boolean;
};

type RefreshProjectContextRequest = {
  readonly projectId?: string;
  readonly workspaceRoot?: string;
  readonly force?: boolean;
};

export const t3workProjectWorkspaceRefreshProjectContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-refresh/project",
  Effect.gen(function* () {
    const refreshService = yield* T3workContextRefreshService;
    const input = yield* readJsonBody<RefreshProjectContextRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const projectId = input.projectId?.trim() ?? "";
    if (workspaceRootInput.length === 0 || projectId.length === 0) {
      return yield* new T3workAtlassianError({
        message: "workspaceRoot and projectId are required.",
      });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    const result = yield* refreshService.refreshProject({
      threadId: ThreadId.make("t3work-context-refresh-http"),
      projectId,
      workspaceRoot,
      force: input.force === true,
    });
    return okJson(result);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to refresh project context.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workProjectWorkspaceRefreshWorkItemContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-refresh/work-item",
  Effect.gen(function* () {
    const refreshService = yield* T3workContextRefreshService;
    const input = yield* readJsonBody<RefreshWorkItemContextRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const ticketKey = input.ticketKey?.trim() ?? "";
    const projectId = input.projectId?.trim() ?? "";
    if (workspaceRootInput.length === 0 || ticketKey.length === 0 || projectId.length === 0) {
      return yield* new T3workAtlassianError({
        message: "workspaceRoot, projectId, and ticketKey are required.",
      });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    const result = yield* refreshService.refreshWorkItem({
      threadId: ThreadId.make("t3work-context-refresh-http"),
      projectId,
      workspaceRoot,
      ticketKey,
      force: input.force === true,
    });
    return okJson(result);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to refresh work-item context.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workProjectWorkspaceRefreshWorkItemSliceContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-refresh/work-item-slice",
  Effect.gen(function* () {
    const refreshService = yield* T3workContextRefreshService;
    const input = yield* readJsonBody<RefreshWorkItemSliceContextRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const ticketKey = input.ticketKey?.trim() ?? "";
    const projectId = input.projectId?.trim() ?? "";
    const focusKind = input.focusKind?.trim() ?? "";
    const focusLabel = input.focusLabel?.trim() ?? "";
    if (
      workspaceRootInput.length === 0 ||
      ticketKey.length === 0 ||
      projectId.length === 0 ||
      focusKind.length === 0 ||
      focusLabel.length === 0
    ) {
      return yield* new T3workAtlassianError({
        message: "workspaceRoot, projectId, ticketKey, focusKind, and focusLabel are required.",
      });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    const result = yield* refreshService.refreshWorkItemSlice({
      threadId: ThreadId.make("t3work-context-refresh-http"),
      projectId,
      workspaceRoot,
      ticketKey,
      focusKind,
      focusLabel,
      summaryItems: input.summaryItems ?? [],
      force: input.force === true,
    });
    return okJson(result);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to refresh work-item slice context.")),
    Effect.catch(errorResponse),
  ),
);
