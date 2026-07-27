// @effect-diagnostics preferSchemaOverJson:off - the harness report is plain JSON for a CLI.
import type { OrchestrationCommand } from "@t3tools/contracts";

import type { T3TeamHarnessScriptLog } from "./t3team-recipeWorkflowHarnessScriptLog.ts";

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
  readonly commandTypes: ReadonlyArray<string>;
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

/** Extract every widget, notification and step phase out of the captured command stream. */
export function summarizeT3TeamHarnessCommands(commands: ReadonlyArray<OrchestrationCommand>) {
  const widgets: T3TeamHarnessWidget[] = [];
  const notifications: string[] = [];
  const phases: string[] = [];
  const steps: string[] = [];
  for (const command of commands) {
    const record = command as unknown as Record<string, unknown>;
    if (record.type === "thread.activity.append") {
      const activity = readRecord(record.activity);
      const payload = readRecord(activity?.payload) ?? readRecord(activity?.data);
      const phase = payload?.phase ?? activity?.phase;
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
    if (record.type !== "thread.message.upsert") {
      continue;
    }
    const message = readRecord(record.message);
    const ext = readRecord(message?.t3teamExt);
    const attachments = Array.isArray(ext?.attachments) ? ext.attachments : [];
    for (const attachment of attachments) {
      const widget = widgetFromAttachment(attachment);
      if (widget) {
        widgets.push(widget);
      }
    }
    const text = message?.text;
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
  readonly commands: ReadonlyArray<OrchestrationCommand>;
  /** Outputs collected by the launch-time `onComplete` sink; non-empty means it fired. */
  readonly completed: ReadonlyArray<unknown>;
  readonly launchStatus: string;
  readonly asksAnswered: number;
  readonly workflowRun: T3TeamRecipeHarnessReport["workflowRun"];
  readonly seededWorkItemCount: number;
}) {
  const summary = summarizeT3TeamHarnessCommands(input.commands);
  return {
    recipeId: input.recipeId,
    status: input.completed.length > 0 ? "completed" : input.launchStatus,
    result: input.completed[0] ?? null,
    phases: summary.phases,
    steps: summary.steps,
    launchStatus: input.launchStatus,
    widgets: summary.widgets,
    notifications: summary.notifications,
    agentPromptCount: input.commands.filter(
      (command) => (command as { type?: string }).type === "thread.turn.start",
    ).length,
    asksAnswered: input.asksAnswered,
    scriptCalls: input.scriptLog.scriptCalls,
    declaredScripts: input.scriptLog.declaredScripts,
    uncalledScripts: input.scriptLog.uncalledScripts,
    workflowRun: input.workflowRun,
    commandTypes: [...new Set(input.commands.map((command) => command.type))],
    seededWorkItemCount: input.seededWorkItemCount,
  } satisfies T3TeamRecipeHarnessReport & {
    readonly seededWorkItemCount: number;
    readonly launchStatus: string;
  };
}
