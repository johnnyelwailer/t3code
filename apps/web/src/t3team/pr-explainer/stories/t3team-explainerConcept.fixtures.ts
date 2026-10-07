import * as Schema from "effect/Schema";

import { T3TeamExplainer } from "../model/t3team-explainer";
import type { HostWidget } from "../t3team-explainerHostKit";

const diagram = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120" font-family="ui-sans-serif,system-ui" font-size="12"><rect width="420" height="120" fill="#f8fafc"/>${[
  ["Command", 20],
  ["Orchestrator", 150],
  ["Outbox", 280],
]
  .map(
    ([label, x]) =>
      `<rect x="${x}" y="40" width="110" height="40" rx="8" fill="#fff" stroke="#cbd5e1"/><text x="${Number(x) + 55}" y="64" text-anchor="middle" fill="#0f172a">${label}</text>`,
  )
  .join(
    "",
  )}<path d="M130 60 H146 M260 60 H276" stroke="#2563eb" stroke-width="2"/><text x="210" y="104" text-anchor="middle" fill="#64748b">decide, commit, then run effects</text></svg>`;

/** Attachments the concept and layout stories reference, resolved by the story host. */
export const conceptAttachments: Readonly<Record<string, string>> = {
  "outbox-diagram": `data:image/svg+xml;charset=utf-8,${encodeURIComponent(diagram)}`,
};

/** A concept with no code: prose, a picture, a callout and a table. */
export const conceptExplainer: T3TeamExplainer = {
  version: 2,
  subject: { kind: "concept", title: "How the outbox runs side effects" },
  generatedAt: "2026-10-07T10:00:00.000Z",
  summary: "Commands decide events without I/O. Effects run only after the events commit.",
  steps: [
    {
      id: "c1",
      kind: "context",
      label: "Decide",
      caption: "A command decides events. It does no I/O.",
      blocks: [
        {
          id: "c1-md",
          type: "markdown",
          text: "The **orchestrator** turns each command into events.\n\n- It reads only state it already holds.\n- It never calls a provider or the disk.\n\nThat keeps every decision *replayable*. Inline <b>HTML</b> such as <kbd>Esc</kbd> or <code>x</code> is formatted too.",
        },
        {
          id: "c1-img",
          type: "image",
          src: "attachment:outbox-diagram",
          alt: "Command flows into the orchestrator, then into the outbox",
          caption: "One command, one transaction",
        },
      ],
    },
    {
      id: "c2",
      kind: "change",
      label: "Commit",
      caption: "Events, projections and outbox rows commit together.",
      blocks: [
        {
          id: "c2-table",
          type: "table",
          title: "Written in one transaction",
          columns: ["Row", "Read by"],
          rows: [
            ["Events", "Replay, audit"],
            ["Projections", "The UI"],
            ["Outbox effects", "The effect worker"],
          ],
        },
        {
          id: "c2-tip",
          type: "callout",
          tone: "tip",
          title: "Why it matters",
          text: "A crash after commit loses nothing: the worker finds the outbox row and runs it.",
        },
      ],
    },
    {
      id: "c3",
      kind: "check",
      label: "Pitfall",
      caption: "Check: an effect must be safe to run twice.",
      blocks: [
        {
          id: "c3-risk",
          type: "callout",
          tone: "risk",
          text: "The worker can retry after a crash. A non-idempotent effect runs twice.",
        },
      ],
    },
  ],
};

/** The sample thread widget a layout step embeds, as the chat's widget frame draws it. */
export const sampleWidget: HostWidget = {
  widgetId: "perf-chart",
  title: "Digest open time",
  format: "html",
  html: `<div style="font:12px system-ui;color:var(--foreground,#18181b)"><div style="margin-bottom:6px">Open time, p50 (ms)</div>${[
    ["Before", 1800, "#a1a1aa"],
    ["After", 140, "#2563eb"],
  ]
    .map(
      ([label, value, color]) =>
        `<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="width:44px">${label}</span><span style="height:12px;width:${Number(value) / 9}px;background:${color};border-radius:3px"></span><span>${value}</span></div>`,
    )
    .join("")}</div>`,
};

/**
 * A step that uses every layout slot, folds detail blocks, embeds both widget kinds, and carries
 * a block type this build does not know. Decoded from raw JSON, as a model's output would be.
 */
const layoutJson: unknown = {
  version: 2,
  subject: { kind: "branch", name: "feat/digest-cache", base: "main", title: "Digest cache" },
  headSha: "9f3c2a1e7d",
  generatedAt: "2026-10-07T10:30:00.000Z",
  summary: "Opening the digest drops from 1.8 s to 0.14 s.",
  risk: "medium",
  steps: [
    {
      id: "p1",
      kind: "change",
      label: "Speed",
      caption: "Opens are about thirteen times faster.",
      blocks: [
        {
          id: "p1-intro",
          type: "markdown",
          layout: "full",
          text: "Rows come from the cache first. GitHub is read **after** the digest shows.",
        },
        {
          id: "p1-chart",
          type: "widget",
          layout: "main",
          source: { kind: "artifact", artifactId: "perf-chart" },
        },
        {
          id: "p1-config",
          type: "code",
          layout: "aside",
          language: "ts",
          path: "prCache.config.ts",
          code: "export const PR_CACHE = {\n  refreshAfterMs: 0,\n  maxProjects: 50,\n};",
          highlight: ["refreshAfterMs: 0"],
        },
        {
          id: "p1-numbers",
          type: "keyValue",
          layout: "aside",
          title: "Measured on 40 projects",
          items: [
            { key: "p50 open", value: "140 ms", tone: "good" },
            { key: "p95 open", value: "310 ms", tone: "good" },
            { key: "GitHub calls / open", value: "1 (background)", tone: "neutral" },
          ],
        },
        {
          id: "p1-delta",
          type: "widget",
          layout: "full",
          title: "Before → after",
          source: {
            kind: "component",
            name: "metricDelta",
            props: {
              metrics: [
                { label: "p50 open", before: "1.8 s", after: "140 ms", better: true },
                { label: "Bundle", before: "412 kB", after: "414 kB" },
              ],
            },
          },
        },
        {
          id: "p1-verify",
          type: "checklist",
          detail: true,
          title: "How to verify",
          items: [
            { text: "Throttle the network to Slow 3G." },
            { text: "Open My Work: rows appear before the spinner stops." },
          ],
        },
        { id: "p1-future", type: "hologram", detail: true, frames: 12 },
      ],
    },
  ],
};

export const layoutExplainer: T3TeamExplainer =
  Schema.decodeUnknownSync(T3TeamExplainer)(layoutJson);
