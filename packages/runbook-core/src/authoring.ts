/**
 * Backend-neutral runbook authoring surface: the shape a Temporal-based
 * executor (living in another repo) and this repo's local journal engine
 * share so a runbook body can be authored once against `RunbookContext` and
 * run on either backend. Derived from the distro's
 * `services/resident-agent/src/sdk/types.ts` (the Temporal-flavored SDK),
 * stripped of anything Temporal- or Node-specific.
 *
 * HARD RULE: this module must import NOTHING with runtime effect — it is
 * transitively importable from a Temporal workflow bundle, which forbids
 * `effect`, Node builtins, or any other runtime dependency. Types are
 * either defined locally here or brought in via `import type` from modules
 * whose own transitive graph is equally clean; when in doubt, re-declare
 * the type locally with a doc comment naming the canonical source, as done
 * below for `LayerId`.
 *
 * Not re-exported from `./index.ts`: the barrel pulls in the engine/journal
 * modules (which depend on `effect`), so re-exporting authoring types there
 * would poison this module's own import graph for consumers who only want
 * the neutral types. Import from the `./authoring` subpath directly.
 */

/** Which cascade layer defined a runbook — `'defaults'` (built-in),
 * `'catalog'` (org catalog repo), or `'project'` (project-local override).
 * Modeled after the distro's `services/resident-agent/src/cascade/layers.ts`
 * `LayerId`, but declared locally and narrowed to the three layers that can
 * actually define runbook logic — that source's fourth variant, `'instance'`,
 * is config-only and never defines a runbook, so it is intentionally not
 * part of this union. */
export type LayerId = "defaults" | "catalog" | "project";

/** A single prompt resolution recorded during a run — the
 * "version-hash-in-journal" fact. */
export interface PromptRecord {
  id: string;
  version: string;
  hash: string;
  /** Which cascade layer produced this resolution. Optional so this stays
   * additive on top of any existing `promptsUsed()` shape. */
  layer?: LayerId;
  /** True iff a project-layer prompt fully replaced the body an earlier
   * layer already defined, rather than filling declared slots. */
  fullReplacement?: boolean;
}

/** Full prompt resolution returned to the runbook body, including its content. */
export interface ResolvedPrompt extends PromptRecord {
  locBudget: number;
  body: string;
}

/** Per-call overrides for `ctx.tool()`'s underlying execution options.
 * Needed for tools whose own job budget can exceed the default timeout
 * (e.g. a long-running agent review job). */
export interface ToolCallOptions {
  /** Overrides the call's start-to-close timeout, in milliseconds. */
  startToCloseTimeoutMs?: number;
  /** Overrides the call's heartbeat timeout, in milliseconds. */
  heartbeatTimeoutMs?: number;
}

/** The structured payload an ask affordance renders — left generic here on
 * purpose; the caller's own module owns the concrete affordance shape. */
export interface AskCard {
  payload: unknown;
  affordance: unknown;
}

export interface AskOptions {
  /** The question to park on, surfaced to whatever face posts it. Always a
   * plain-text fallback, even when `card` is also set. */
  question: string;
  /** How long to wait for an answer before falling back, in ms (or a
   * backend-specific duration string). */
  timeout: number | string;
  /** Optional structured decision-card payload. */
  card?: AskCard;
}

export interface AskResult {
  /** The human's answer, or undefined if the ask timed out. */
  answer: string | undefined;
  timedOut: boolean;
  /** Who actually answered, as reported by whatever adapter relayed the
   * signal — `undefined` when no identity was supplied with the answer.
   * Verifying the identity is genuine is the adapter's job, not this
   * context's. */
  responder?: string;
}

/**
 * RunbookContext mirrors the runbook authoring feel (tool calls, asks,
 * durable sleeps, deterministic primitives, prompts) independent of which
 * backend maps it onto Temporal workflow constructs or the local journal
 * engine. Every method here must stay safe to call from workflow/replay
 * code: no direct I/O, only proxied calls, signals, timers, and
 * deterministic globals the concrete backend provides.
 */
export interface RunbookContext {
  /** Calls a named tool. `options` lets a runbook body request a longer
   * timeout than the backend's defaults for tools with a variable,
   * potentially-long-running job budget (see ToolCallOptions). */
  tool<T = unknown>(
    name: string,
    args?: Record<string, unknown>,
    options?: ToolCallOptions,
  ): Promise<T>;

  /** Parks the run on a human answer, with a timeout fallback. */
  ask(options: AskOptions): Promise<AskResult>;

  /** Durable sleep for `ms` (or a backend-specific duration string). */
  sleep(ms: number | string): Promise<void>;

  /** Durable sleep until an absolute point in time. */
  waitUntil(date: Date): Promise<void>;

  /** Deterministic "current time". */
  now(): Date;

  /** Deterministic UUID. */
  uuid(): string;

  /** Deterministic pseudo-random number in [0, 1). */
  random(): number;

  /** Resolves a prompt by id from the registry and records it into promptsUsed(). */
  prompt(id: string): Promise<ResolvedPrompt>;

  /** Snapshot of every prompt resolved so far in this run. */
  promptsUsed(): PromptRecord[];

  /** This run's own identity, for attributing artifacts created during the
   * run to the run that created them. */
  runInfo(): { workflowId: string; runId: string };
}
