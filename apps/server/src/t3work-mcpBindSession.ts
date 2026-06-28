import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  clearT3workToolBinding,
  setT3workToolBinding,
} from "./t3work-toolBrokerSessionRegistry.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";
import { T3workToolBroker, type T3workTurnToolContext } from "./t3work-toolBroker.ts";

const DEFAULT_TICKET_THREAD_TOOL_GROUPS = ["artifact.rw"] as const;

function readKickoffWorkflow(toolContext: T3workTurnToolContext) {
  if (!toolContext.state || typeof toolContext.state !== "object") {
    return undefined;
  }
  const kickoff = (toolContext.state as { readonly kickoff?: unknown }).kickoff;
  if (!kickoff || typeof kickoff !== "object") {
    return undefined;
  }
  const workflow = (kickoff as { readonly workflow?: unknown }).workflow;
  return workflow && typeof workflow === "object"
    ? (workflow as { readonly allowedToolGroups?: unknown })
    : undefined;
}

function readViewTicketId(toolContext: T3workTurnToolContext): string | undefined {
  if (!toolContext.state || typeof toolContext.state !== "object") {
    return undefined;
  }
  const view = (toolContext.state as { readonly view?: unknown }).view;
  if (!view || typeof view !== "object") {
    return undefined;
  }
  const ticketId = (view as { readonly ticketId?: unknown }).ticketId;
  return typeof ticketId === "string" && ticketId.trim().length > 0 ? ticketId.trim() : undefined;
}

export function resolveAllowedToolGroups(
  toolContext: T3workTurnToolContext,
): ReadonlyArray<string> | undefined {
  const workflow = readKickoffWorkflow(toolContext);
  const groups = workflow?.allowedToolGroups;
  if (Array.isArray(groups)) {
    const normalized = groups.filter(
      (group): group is string => typeof group === "string" && group.trim().length > 0,
    );
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return readViewTicketId(toolContext) ? [...DEFAULT_TICKET_THREAD_TOOL_GROUPS] : undefined;
}

export const bindT3workBrokerForProviderThread = Effect.fn("bindT3workBrokerForProviderThread")(
  function* (threadId: ThreadId) {
    const broker = yield* T3workToolBroker;
    const contextStore = yield* T3workThreadToolContextStore;
    const toolContext = yield* contextStore.get(threadId);
    if (!toolContext || toolContext.surface !== "t3work") {
      clearT3workToolBinding(threadId);
      return undefined;
    }

    const allowedToolGroups = resolveAllowedToolGroups(toolContext);
    const binding = yield* broker.bindSession({
      threadId,
      ...(allowedToolGroups ? { allowedToolGroups } : {}),
    });
    if (!binding) {
      clearT3workToolBinding(threadId);
      return undefined;
    }

    setT3workToolBinding(binding);
    return binding;
  },
);

export const maybeBindT3workBrokerForProviderThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const broker = yield* Effect.serviceOption(T3workToolBroker);
    const contextStore = yield* Effect.serviceOption(T3workThreadToolContextStore);
    if (Option.isNone(broker) || Option.isNone(contextStore)) {
      clearT3workToolBinding(threadId);
      return undefined;
    }

    return yield* bindT3workBrokerForProviderThread(threadId).pipe(
      Effect.provideService(T3workToolBroker, broker.value),
      Effect.provideService(T3workThreadToolContextStore, contextStore.value),
    );
  });
