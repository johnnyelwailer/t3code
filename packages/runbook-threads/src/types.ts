/**
 * The author-facing types of the Thread model (Epic 25 §The thread model) — the `Thread`
 * interface returned by `thread` / `spawnThread`, the ask/notify option shapes, and the
 * `WorkflowThreadPrimitives` bundle the runtime binds into the workflow body.
 */

import type * as Schema from "effect/Schema";

import type { AgentAttachment } from "./attachments.ts";
import type { WorkflowChildCapabilities } from "./capabilities.ts";
import type { ModelRef, ModelOption } from "./models.ts";

/**
 * One rung of a {@link ModelCascade}. All three shapes are legal:
 *   • `{ instanceId, model }` — a specific model on a specific provider instance;
 *   • `{ instanceId }`        — that instance's declared default, or the current model when it is the current instance;
 *   • `{ model }`             — that model on the run's CURRENT provider instance.
 * `model` may be a typed `ModelRef` from a host's model catalog or a raw provider slug.
 */
export interface ModelCascadeEntry {
  readonly instanceId?: string;
  readonly model?: ModelRef | string;
}

/**
 * A provider ladder, tried in order. The HOST walks it against its live provider registry and
 * picks the FIRST rung whose instance is configured, installed, enabled, and owns the model —
 * the same availability check a host uses for cross-provider spawning. When
 * no rung is available the run's current/default selection is kept (the ask never fails on
 * availability alone). The winning rung is journaled, so a replay reuses the recorded choice
 * instead of re-probing a registry whose availability may have changed since.
 *
 * An explicit single `model` WINS over a cascade: `models` is the fallback ladder, not an
 * override. Effort composes — {@link AgentEffort} is mapped onto the CHOSEN provider's controls.
 */
export type ModelCascade = ReadonlyArray<ModelCascadeEntry>;

/**
 * How hard the agent should think, WITHOUT naming a provider or a model (PR review: "a generic
 * way to define agent effort without having to specify exact provider/model … which could either
 * delegate to different models altogether or just different thinking levels"). The run's current
 * provider is kept; the host maps the tier onto whatever reasoning/thinking control that provider
 * exposes, and degrades to a no-op when it exposes none — an effort request never fails a call.
 */
export type AgentEffort = "light" | "standard" | "high";

/** A reference to a thread the workflow can drive. `id` is the thread's stable id. */
export interface ThreadRef {
  readonly kind: "thread-ref";
  readonly id: string;
}

/** Options for an ask verb (`agent` / `askAgent` / `askUser`). */
export interface AskOpts<R = string> {
  /**
   * Short human-facing workflow label. Kept separate from the full agent/user prompt. For an
   * ask inside a loop, keep it STABLE across iterations (no iteration counter): the run card
   * groups consecutive same-label steps into one collapsible row, so `'Pick next task (17)'`
   * defeats the grouping and renders one row per iteration.
   */
  readonly label?: string;
  readonly schema?: Schema.Schema<R>;
  /** `instance/slug` selects an exact model; `instance` selects its latest available default. */
  readonly model?: ModelOption;
  /** Provider fallback ladder; ignored when `model` is given. See {@link ModelCascade}. */
  readonly models?: ModelCascade;
  /** Thinking level for this ask, provider-agnostic. See {@link AgentEffort}. */
  readonly effort?: AgentEffort;
  /**
   * Structured data the agent should work on — passed as OBJECTS, never stringified by the
   * author: `agent("Judge these gates", { attachments: [gates] })`. The runtime names them,
   * journals them as structure, and serializes them once when it composes the provider-facing
   * turn. Wrap a value as `{ name, value }` to control the name the agent sees.
   */
  readonly attachments?: ReadonlyArray<AgentAttachment>;
}

/**
 * A serializable external-resource reference rendered as a clickable card on the `askUser`
 * decision message (e.g. the bug the user is being asked to decide on). Structurally a subset
 * of `ExternalResourceRef`, so refs from `context` queries can be passed straight through; the
 * SDK treats them as opaque payload (black-box rule) and the host validates against its message
 * contract — `kind` must be a known resource kind (`"issue"`, `"ticket"`, `"page"`,
 * `"pull-request"`, `"epic"`) for the card to render.
 */
export interface AskUserAttachment {
  readonly provider: string;
  readonly kind: string;
  readonly id: string;
  readonly title: string;
  readonly displayId?: string;
  readonly description?: string;
  readonly url?: string;
  readonly status?: string;
}

/** Options for `askUser` — `AskOpts` plus resources to show on the decision card. */
export interface AskUserOpts<R = string> extends AskOpts<R> {
  readonly attachments?: ReadonlyArray<AskUserAttachment>;
  /** Approve/reject button labels for a `Schema.Boolean` ask (the descriptor's `boolean`
   * affordance). Absent → the card defaults to "Yes"/"No". Ignored for non-boolean schemas. */
  readonly labels?: { readonly true: string; readonly false: string };
}

/** The widest ask-opts shape the internal dispatch loop accepts: agent opts (whose `attachments`
 * are arbitrary author data) plus the `askUser`-only extras. Every public opts type is assignable
 * to it, which `AskUserOpts` — narrowing `attachments` to resource refs — is not. */
export type AnyAskOpts<R = string> = AskOpts<R> & Pick<AskUserOpts<R>, "labels">;

export type { WorkflowChildCapabilities } from "./capabilities.ts";

/**
 * Options for `spawnThread`. `capabilities` is REQUIRED — see {@link WorkflowChildCapabilities} for
 * why there is no default. Everything else keeps its existing meaning, so the only authoring form
 * this breaks is the one that never said what the child was allowed to do.
 */
export interface SpawnThreadOpts<Capabilities = WorkflowChildCapabilities> {
  /** What the spawned thread's agent may do: `"inherit"`, or an explicit subset of the parent's. */
  readonly capabilities: Capabilities;
  readonly name?: string;
  /** `instance/slug` selects an exact model; `instance` selects its latest available default. */
  readonly model?: ModelOption;
  /** Provider fallback ladder for the thread's asks; ignored when `model` is given. Resolved ONCE
   * per thread (on its first ask) and reused by every later ask on it. See {@link ModelCascade}. */
  readonly models?: ModelCascade;
  /** Default thinking level for the thread's turns, provider-agnostic. See {@link AgentEffort}. */
  readonly effort?: AgentEffort;
  /** Ephemeral children stay out of the sidebar; retained children are durable and visible. */
  readonly retention?: "ephemeral" | "retained";
  readonly checkout?: WorkflowChildCheckout;
}

/**
 * Where a child thread works. `"project"` (the default) is the project root; `"launch-thread"` is
 * the launch thread's branch and worktree, for a recipe that must change the checkout it was
 * started from (fixing a PR branch). A headless run has no launch thread and uses the root.
 */
export type WorkflowChildCheckout = "project" | "launch-thread";

/**
 * Options for `agent(prompt, opts)` — the one-shot `spawnThread(opts).askAgent(prompt, opts)`. It
 * CREATES a child, so like `spawnThread` it must say what that child may do; the ask-side options
 * (`schema` / `model` / `models` / `effort` / `attachments` / `label`) are the same `AskOpts`.
 *
 * A verb that drives an ALREADY-EXISTING thread — `askAgent`, `askUser`, `notifyAgent`,
 * `notifyUser`, `showWidget` — deliberately takes no `capabilities`: that thread's capabilities were
 * decided once, where it was created. Two places to state the same grant is how they drift apart.
 */
export interface AgentOpts<
  R = string,
  Capabilities = WorkflowChildCapabilities,
> extends AskOpts<R> {
  /** What the one-shot child may do: `"inherit"`, or an explicit subset of the parent's. */
  readonly capabilities: Capabilities;
  /** Where the one-shot child works; see {@link WorkflowChildCheckout}. */
  readonly checkout?: WorkflowChildCheckout;
}

/** Sandboxed inline widget shown in a thread. HTML/SVG must be a fragment.
 * Prefer `intent` (builder authors the body); pass `widgetCode` to skip the builder
 * (required for deterministic workflow replay). `format: "html"` shims onto upstream HTML render. */
export interface ShowWidgetInput {
  readonly title: string;
  /** Raw fragment; skips the builder. Provide this or `intent`. */
  readonly widgetCode?: string;
  /** Preferred: describe what to show; builder authors widgetCode. */
  readonly intent?: string;
  readonly format?: "html" | "svg";
  readonly loadingMessages?: ReadonlyArray<string>;
}

/**
 * A registered view posted into a thread (`Thread.showView`). The view's component is trusted
 * host or pack code; `props` are untrusted data it decodes with its own schema, so pass ids and
 * small values, never markup.
 */
export interface ShowViewInput {
  /** Idempotency key within the thread: re-posting the same key updates the view in place. */
  readonly key: string;
  /** `<packId>.<name>`, as the pack registered it (`registerView({ slot: "message.view" })`). */
  readonly viewId: string;
  readonly props: Readonly<Record<string, unknown>>;
}

/** The one Thread type, shared by the ambient launching thread and any spawned one. */
export interface Thread {
  /**
   * Drive a TURN on this thread and park until it answers. On the LAUNCH thread (`getThread()`)
   * this is how a routine keeps the user's own thread working — each wake becomes a turn there,
   * so that thread is both the worker and the log; `agent()`/`spawnThread()` run the work somewhere
   * else and leave it idle. Give the turn a durable place to read its plan from (the thread's task
   * journal, an issue, a file): a wake that only says "continue" has no memory of what continue
   * means once the context window has been compacted. End the loop on a real condition.
   */
  askAgent<R = string>(prompt: string, opts?: AskOpts<R>): Promise<R>;
  /** Fire-and-forget: posts to the thread's agent and returns at once; never parks the run. */
  notifyAgent(msg: string): void;
  /** Park until the human answers in this thread. Requires the `user` capability; a spawned
   * child's ask is routed to the launch thread. Surface the evidence the decision depends on
   * first (`showWidget`/`notifyUser`), and give a `schema` so the card renders controls. */
  askUser<R = string>(question: string, opts?: AskUserOpts<R>): Promise<R>;
  /** Fire-and-forget verdict line for the human; never parks the run. Requires `user`. */
  notifyUser(msg: string): void;
  /** Sandboxed inline HTML/SVG for the human (theme variables, host icon sprite). Requires `user`.
   * Fire-and-forget. */
  showWidget(input: ShowWidgetInput): void;
  /** Post (or re-post, by `key`) a registered view into this thread. Requires `ui.render`.
   * Fire-and-forget; a run without a thread (`getThread()` undefined) has nowhere to show it. */
  showView(input: ShowViewInput): void;
  readonly id: ThreadRef;
}

/** The globals this module binds into the workflow body. */
export interface WorkflowThreadPrimitives<Capabilities = WorkflowChildCapabilities> {
  /** The thread the workflow runs in (the chat the user launched from); `undefined` if
   * headless (cron/automation, no chat surface). */
  readonly thread: Thread | undefined;
  readonly spawnThread: (opts: SpawnThreadOpts<Capabilities>) => Thread;
  readonly agent: <R = string>(prompt: string, opts: AgentOpts<R, Capabilities>) => Promise<R>;
}
