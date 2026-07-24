/**
 * On-demand help registry — one generic `t3work_help(topic)` tool instead of a
 * tool (or a giant description) per topic. An agent discovers reference material
 * proactively, without failing first and without bloating every turn's context.
 *
 * Add a topic by registering a `{ slug, title, summary, body }` entry. Keep tool
 * descriptions lean and point at `t3work_help("<slug>")` for the detail.
 *
 * @module t3work-help
 */
import { T3WORK_TIMERS_MANUAL, T3WORK_WORKFLOW_MANUAL } from "./t3work-workflowManual.ts";

export interface T3workHelpTopic {
  readonly slug: string;
  readonly title: string;
  /** One line shown in the topic index. */
  readonly summary: string;
  /** The full reference text returned when this topic is requested. */
  readonly body: string;
}

const TOPICS: ReadonlyArray<T3workHelpTopic> = [
  {
    slug: "agent-orchestration",
    title: "Agent orchestration (t3work_orchestration_run)",
    summary:
      "How to author t3work_orchestration_run bodies — fan-out, sequencing, durable timers/routines, injected globals, and meta.",
    body: T3WORK_WORKFLOW_MANUAL,
  },
  {
    slug: "timers",
    title: "Durable orchestration timers and routines",
    summary: "Exact waitUntil/now syntax for one-shot waits and recurring durable routines.",
    body: T3WORK_TIMERS_MANUAL,
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
};

const indexText = (): string =>
  ["Available t3work_help topics (call t3work_help with one of these slugs):", ""]
    .concat(TOPICS.map((t) => `- ${t.slug} — ${t.summary}`))
    .join("\n");

/**
 * Resolve a help request. Empty/unknown topic returns the topic index so the
 * agent can pick; a known topic (or alias) returns its full body.
 */
export const t3workHelp = (topic?: string): string => {
  const key = (topic ?? "").trim().toLowerCase();
  if (key.length === 0) return indexText();
  const slug = ALIASES[key] ?? key;
  const found = TOPICS.find((t) => t.slug === slug);
  if (!found) {
    return `No help topic "${topic}". ${indexText()}`;
  }
  return found.body;
};
