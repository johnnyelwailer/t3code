// @effect-diagnostics preferSchemaOverJson:off - the harness report is plain JSON for a CLI.
import type { T3TeamHarnessScriptLog } from "./t3team-recipeWorkflowHarnessScriptLog.ts";
import type { T3TeamRecipeHarnessOperation } from "./t3team-recipeWorkflowHarnessStub.ts";

export type T3TeamHarnessWidget = {
  readonly title: string;
  readonly format: string;
  readonly widgetCode: string;
  readonly byteLength: number;
  readonly iconNames: ReadonlyArray<string>;
};

export type T3TeamRecipeHarnessReport = {
  readonly recipeId: string;
  readonly status: string;
  readonly result: unknown;
  /** Distinct workflow step lifecycle phases the run emitted, in first-seen order. */
  readonly phases: ReadonlyArray<string>;
  /** `<stepKind>: <detail>` for each workflow step activity, in order — the executed plan. */
  readonly steps: ReadonlyArray<string>;
  readonly widgets: ReadonlyArray<T3TeamHarnessWidget>;
  /** Text of every user-directed notification the run posted. */
  readonly notifications: ReadonlyArray<string>;
  readonly agentPromptCount: number;
  readonly asksAnswered: number;
  /** Every `scripts.*` dispatch the run JOURNALED, in call order (repeats kept) — an
   * invocation log, not the recipe's declarations. See `…HarnessScriptLog`. */
  readonly scriptCalls: ReadonlyArray<string>;
  /** The names the recipe registered under `scripts` (sorted). */
  readonly declaredScripts: ReadonlyArray<string>;
  /** Declared but never dispatched; non-empty means the recipe over-claims — the runner fails. */
  readonly uncalledScripts: ReadonlyArray<string>;
  readonly workflowRun: {
    readonly runId: string;
    readonly status: string;
    readonly workflowPath: string;
  } | null;
  /** The distinct workflow-host operations the run performed (`createThread`, `startTurn`, …). */
  readonly hostOperations: ReadonlyArray<string>;
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function widgetFromAttachment(attachment: unknown): T3TeamHarnessWidget | null {
  const record = readRecord(attachment);
  const widget = readRecord(record?.widget) ?? record;
  const widgetCode = widget?.html ?? widget?.widgetCode ?? widget?.widget_code;
  if (typeof widgetCode !== "string") {
    return null;
  }
  return {
    title: typeof widget?.title === "string" ? widget.title : "",
    format: typeof widget?.format === "string" ? widget.format : "html",
    widgetCode,
    byteLength: Buffer.byteLength(widgetCode, "utf8"),
    iconNames: [...widgetCode.matchAll(/#t3w-icon-([a-z0-9-]+)/g)].map((match) => match[1]!),
  };
}

/** Extract every widget, notification and step phase out of the recorded host operations. */
export function summarizeT3TeamHarnessOperations(
  operations: ReadonlyArray<T3TeamRecipeHarnessOperation>,
) {
  const widgets: T3TeamHarnessWidget[] = [];
  const notifications: string[] = [];
  const phases: string[] = [];
  const steps: string[] = [];
  for (const { op, input } of operations) {
    const record = readRecord(input);
    if (op === "upsertActivity") {
      const payload = readRecord(record?.payload);
      const phase = payload?.phase;
      if (typeof phase === "string" && !phases.includes(phase)) {
        phases.push(phase);
      }
      const stepKind = payload?.stepKind;
      if (typeof stepKind === "string") {
        const entry = `${stepKind}: ${typeof payload?.detail === "string" ? payload.detail : ""}`;
        if (!steps.includes(entry)) {
          steps.push(entry);
        }
      }
      continue;
    }
    if (op !== "postMessage") {
      continue;
    }
    const ext = readRecord(record?.ext);
    const attachments = Array.isArray(ext?.attachments) ? ext.attachments : [];
    for (const attachment of attachments) {
      const widget = widgetFromAttachment(attachment);
      if (widget) {
        widgets.push(widget);
      }
    }
    const text = record?.text;
    if (typeof text === "string" && text.trim().length > 0 && attachments.length === 0) {
      notifications.push(text);
    }
  }
  return { widgets, notifications, phases, steps };
}

/** Shape the harness's terminal state into the report the CLI runner prints. */
export function assembleT3TeamRecipeHarnessReport(input: {
  readonly recipeId: string;
  /** The journal-derived invocation log + declaration diff (`…HarnessScriptLog`). */
  readonly scriptLog: T3TeamHarnessScriptLog;
  readonly operations: ReadonlyArray<T3TeamRecipeHarnessOperation>;
  /** Outputs collected by the launch-time `onComplete` sink; non-empty means it fired. */
  readonly completed: ReadonlyArray<unknown>;
  readonly launchStatus: string;
  readonly asksAnswered: number;
  readonly workflowRun: T3TeamRecipeHarnessReport["workflowRun"];
  readonly seededWorkItemCount: number;
}) {
  const summary = summarizeT3TeamHarnessOperations(input.operations);
  return {
    recipeId: input.recipeId,
    status: input.completed.length > 0 ? "completed" : input.launchStatus,
    result: input.completed[0] ?? null,
    phases: summary.phases,
    steps: summary.steps,
    launchStatus: input.launchStatus,
    widgets: summary.widgets,
    notifications: summary.notifications,
    agentPromptCount: input.operations.filter(({ op }) => op === "startTurn").length,
    asksAnswered: input.asksAnswered,
    scriptCalls: input.scriptLog.scriptCalls,
    declaredScripts: input.scriptLog.declaredScripts,
    uncalledScripts: input.scriptLog.uncalledScripts,
    workflowRun: input.workflowRun,
    hostOperations: [...new Set(input.operations.map(({ op }) => op))],
    seededWorkItemCount: input.seededWorkItemCount,
  } satisfies T3TeamRecipeHarnessReport & {
    readonly seededWorkItemCount: number;
    readonly launchStatus: string;
  };
}
