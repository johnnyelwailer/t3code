/**
 * The author-facing types of the Thread model (Epic 25 §The thread model) — the `Thread`
 * interface returned by `thread` / `spawnThread`, the ask/notify option shapes, and the
 * `WorkflowThreadPrimitives` bundle the runtime binds into the workflow body. The
 * implementations live in `t3work-sdk.threadPrimitives.ts`.
 */

import type * as Schema from "effect/Schema";

import type { AgentAttachment } from "./t3work-sdk.askAttachments.ts";
import type { ModelRef, ModelSelection } from "./t3work-sdk.types.ts";

/**
 * One rung of a {@link ModelCascade}. All three shapes are legal:
 *   • `{ instanceId, model }` — a specific model on a specific provider instance;
 *   • `{ instanceId }`        — that instance, on the run's model if it has it else its first;
 *   • `{ model }`             — that model on the run's CURRENT provider instance.
 * `model` may be a typed `ModelRef` from `@t3work/sdk/models` or a raw provider slug (custom
 * local models are not in the SDK's build-time tree).
 */
export interface ModelCascadeEntry {
  readonly instanceId?: string;
  readonly model?: ModelRef | string;
}

/**
 * A provider ladder, tried in order. The HOST walks it against its live provider registry and
 * picks the FIRST rung whose instance is configured, installed, enabled, and owns the model —
 * the same availability check `t3work.thread.start_child` uses for cross-provider spawning. When
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
  /** Short human-facing workflow label. Kept separate from the full agent/user prompt. */
  readonly label?: string;
  readonly schema?: Schema.Schema<R>;
  readonly model?: ModelSelection;
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

/** Options for `spawnThread`. */
export interface SpawnThreadOpts {
  readonly name?: string;
  readonly model?: ModelSelection;
  /** Provider fallback ladder for the thread's asks; ignored when `model` is given. Resolved ONCE
   * per thread (on its first ask) and reused by every later ask on it. See {@link ModelCascade}. */
  readonly models?: ModelCascade;
  /** Default thinking level for the thread's turns, provider-agnostic. See {@link AgentEffort}. */
  readonly effort?: AgentEffort;
  /** Ephemeral children stay out of the sidebar; retained children are durable and visible. */
  readonly retention?: "ephemeral" | "retained";
}

/** Sandboxed inline widget shown in a thread. HTML/SVG must be a fragment. */
export interface ShowWidgetInput {
  readonly title: string;
  readonly widgetCode: string;
  readonly format?: "html" | "svg";
  readonly loadingMessages?: ReadonlyArray<string>;
}

/** The one Thread type, shared by the ambient launching thread and any spawned one. */
export interface Thread {
  askAgent<R = string>(prompt: string, opts?: AskOpts<R>): Promise<R>;
  notifyAgent(msg: string): void;
  askUser<R = string>(question: string, opts?: AskUserOpts<R>): Promise<R>;
  notifyUser(msg: string): void;
  showWidget(input: ShowWidgetInput): void;
  readonly id: ThreadRef;
}

/** The globals this module binds into the workflow body. */
export interface WorkflowThreadPrimitives {
  /** The thread the workflow runs in (the chat the user launched from); `undefined` if
   * headless (cron/automation, no chat surface). */
  readonly thread: Thread | undefined;
  readonly spawnThread: (opts?: SpawnThreadOpts) => Thread;
  readonly agent: <R = string>(prompt: string, opts?: AskOpts<R>) => Promise<R>;
}
