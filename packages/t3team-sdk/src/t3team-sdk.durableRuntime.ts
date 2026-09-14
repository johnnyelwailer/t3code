/**
 * T3Code's runtime adapter. Replay ordering, deterministic primitives, and durable handles live
 * in `@runbook/core`; this module binds T3Code's tool/script dispatch and preserves the existing
 * public `createDurableWorkflowRuntime` surface.
 */

import { createDurableRuntime, type DurablePrimitiveRuntime } from "@runbook/core/durableRuntime";
import type { WorkflowEventSink } from "@runbook/core/events";
import type { SuspensionLatch } from "@runbook/core/handles";
import type { JournalEntry, ResolvedEntry } from "./t3team-sdk.journalReader.ts";
import type { JournalSink } from "./t3team-sdk.journalStore.ts";
import { createToolScriptCalls } from "./t3team-sdk.toolScriptCalls.ts";
import type * as T from "./t3team-sdk.types.ts";
import { hostSource } from "@runbook/ts/globals";

export interface DurableRuntimeConfig {
  readonly journal: ReadonlyMap<number, JournalEntry>;
  readonly writer: JournalSink;
  readonly toolCtx: T.ToolHandlerCtx;
  readonly scriptCtx: T.ScriptHandlerCtx;
  readonly scriptNames: ReadonlyMap<T.AnyScriptRef, string>;
  readonly filePath?: string;
  readonly nowIso: () => string;
  readonly runId?: string;
  readonly resolved?: ReadonlyMap<string, ResolvedEntry>;
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
  /** Live lifecycle observations; primitive started/completed events are emitted here. */
  readonly events?: WorkflowEventSink;
  /** First-class abort: the next live primitive call after it fires throws WorkflowAborted. */
  readonly abortSignal?: AbortSignal;
  /** The run's suspension latch, shared with the run boundary so a body that CATCHES the
   * suspension signal still cannot complete the run. Absent = this runtime owns a private one. */
  readonly suspension?: SuspensionLatch;
}

export type DurableWorkflowRuntime = Omit<DurablePrimitiveRuntime, "callPrimitive"> &
  T.WorkflowRuntime & {
    /** Tokens spent so far — thread-turn token rollup remains a host policy. */
    readonly spentAgentTokens: () => number;
  };

export function createDurableWorkflowRuntime(config: DurableRuntimeConfig): DurableWorkflowRuntime {
  const primitiveRuntime = createDurableRuntime({
    journal: config.journal,
    writer: config.writer,
    source: hostSource(),
    nowIso: config.nowIso,
    ...(config.filePath === undefined ? {} : { filePath: config.filePath }),
    ...(config.runId === undefined ? {} : { runId: config.runId }),
    ...(config.resolved === undefined ? {} : { resolved: config.resolved }),
    ...(config.events === undefined ? {} : { events: config.events }),
    ...(config.abortSignal === undefined ? {} : { abortSignal: config.abortSignal }),
    ...(config.suspension === undefined ? {} : { suspension: config.suspension }),
  });

  let toolScript!: ReturnType<typeof createToolScriptCalls>;
  const blackBox: T.WorkflowRuntime = {
    callTool: (ref, args) => toolScript.callTool(ref, args),
    callScript: (ref, args) => toolScript.callScript(ref, args),
    callPrimitive: (call) => call.exec(),
    now: primitiveRuntime.hostNow,
    random: primitiveRuntime.hostRandom,
    uuid: primitiveRuntime.hostUuid,
  };

  toolScript = createToolScriptCalls({
    callPrimitive: primitiveRuntime.callPrimitive,
    blackBox,
    toolCtx: config.toolCtx,
    scriptCtx: config.scriptCtx,
    scriptNames: config.scriptNames,
    ...(config.beforePrimitive === undefined ? {} : { beforePrimitive: config.beforePrimitive }),
    ...(config.afterPrimitive === undefined ? {} : { afterPrimitive: config.afterPrimitive }),
  });

  return {
    ...primitiveRuntime,
    callTool: toolScript.callTool,
    callScript: toolScript.callScript,
    spentAgentTokens: () => 0,
  };
}
