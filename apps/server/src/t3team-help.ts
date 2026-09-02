/**
 * On-demand help registry — one generic `t3team_help(topic)` tool instead of a
 * tool (or a giant description) per topic. An agent discovers reference material
 * proactively, without failing first and without bloating every turn's context.
 *
 * Add a topic by registering a `{ slug, title, summary, body }` entry. Keep tool
 * descriptions lean and point at `t3team_help("<slug>")` for the detail.
 *
 * @module t3team-help
 */
import { T3TEAM_WIDGET_AUTHORING_GUIDANCE } from "@t3tools/project-context/t3teamWidgetGuidance";

import { T3TEAM_REPORTING_MANUAL } from "./t3team-workflowManualReporting.ts";
import { T3TEAM_TIMERS_MANUAL, T3TEAM_WORKFLOW_MANUAL } from "./t3team-workflowManual.ts";

export interface T3TeamHelpTopic {
  readonly slug: string;
  readonly title: string;
  /** One line shown in the topic index. */
  readonly summary: string;
  /** The full reference text returned when this topic is requested. */
  readonly body: string;
}

const TOPICS: ReadonlyArray<T3TeamHelpTopic> = [
  {
    slug: "agent-orchestration",
    title: "Agent orchestration (t3team_orchestration_run)",
    summary:
      "How to author t3team_orchestration_run bodies — fan-out, sequencing, durable timers/routines, injected globals, and meta.",
    body: T3TEAM_WORKFLOW_MANUAL,
  },
  {
    slug: "timers",
    title: "Durable orchestration timers and routines",
    summary: "Exact waitUntil/now syntax for one-shot waits and recurring durable routines.",
    body: T3TEAM_TIMERS_MANUAL,
  },
  {
    slug: "reporting",
    title: "Reporting an orchestration's outcome to the human",
    summary:
      "Return structured results instead of prose, lead with the verdict, put numbers in a table, and never forward a sub-agent's raw output.",
    body: T3TEAM_REPORTING_MANUAL,
  },
  {
    slug: "widget-guidance",
    title: "Widget authoring guidance (thread.showWidget / t3team.widget.show)",
    summary:
      "Theme CSS variables, the icon sprite, layout/CSP rules for any widget body — same contract thread.showWidget and the t3team.widget.show tool both use.",
    body: T3TEAM_WIDGET_AUTHORING_GUIDANCE,
  },
];

/** Aliases → canonical slug, so common phrasings resolve to the right topic. */
const ALIASES: Readonly<Record<string, string>> = {
  workflow: "agent-orchestration",
  workflows: "agent-orchestration",
  runbook: "agent-orchestration",
  orchestration: "agent-orchestration",
  "workflow-run": "agent-orchestration",
  "orchestration-run": "agent-orchestration",
  runbooks: "agent-orchestration",
  timer: "timers",
  schedule: "timers",
  scheduling: "timers",
  widget: "widget-guidance",
  widgets: "widget-guidance",
  showwidget: "widget-guidance",
};

const indexText = (): string =>
  ["Available t3team_help topics (call t3team_help with one of these slugs):", ""]
    .concat(TOPICS.map((t) => `- ${t.slug} — ${t.summary}`))
    .join("\n");

/**
 * Resolve a help request. Empty/unknown topic returns the topic index so the
 * agent can pick; a known topic (or alias) returns its full body.
 */
export const t3teamHelp = (topic?: string): string => {
  const key = (topic ?? "").trim().toLowerCase();
  if (key.length === 0) return indexText();
  const slug = ALIASES[key] ?? key;
  const found = TOPICS.find((t) => t.slug === slug);
  if (!found) {
    return `No help topic "${topic}". ${indexText()}`;
  }
  return found.body;
};
