/**
 * The author-facing types of the Thread model (Epic 25 §The thread model) — the `Thread`
 * interface returned by `thread` / `spawnThread`, the ask/notify option shapes, and the
 * `WorkflowThreadPrimitives` bundle the runtime binds into the workflow body. The
 * implementations live in `t3work-sdk.threadPrimitives.ts`.
 */

import type * as Schema from "effect/Schema";

import type { AgentAttachment } from "./t3work-sdk.askAttachments.ts";
import type { ModelSelection } from "./t3work-sdk.types.ts";

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
