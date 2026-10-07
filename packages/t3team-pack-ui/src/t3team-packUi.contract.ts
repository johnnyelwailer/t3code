/**
 * `pack-ui:1` — the contract between a pack's web module and the host web app.
 *
 * A pack's web entry (`contents.views`, capability `view:v1`) default-exports a
 * `defineWebActivate(...)`. The host runs it once at boot with a context bound to the pack id; the
 * pack registers views into named slots. Host primitives (`Button`, `Markdown`, …) are typed here
 * and implemented by the host app, which aliases `@t3team/pack-ui` to its implementation, so there
 * is exactly one copy of each primitive and a pack never imports host internals.
 *
 * Variant and size names below are part of the contract: renaming one is a breaking change.
 */
import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type * as Schema from "effect/Schema";

/** Bumped on a breaking change to anything in this file. */
export const PACK_UI_VERSION = 1;

/** The slots a view can be registered into. Only slots the host renders are listed. */
export type ViewSlot = "message.view";

/** What a `message.view` component receives. `props` were decoded with the registration's schema. */
export interface MessageViewProps<P> {
  readonly threadRef: ScopedThreadRef | null;
  /** The timeline row the view renders in. */
  readonly messageId: string;
  readonly props: P;
}

/**
 * A view rendered for a `{ kind: "view", miniappId: id }` message attachment — the attachment a
 * workflow posts with `getThread()?.showView({ key, viewId: id, props })`.
 *
 * `props` arrive from thread data an agent can write, so they are untrusted: the schema is
 * required, and the decoded value is data (ids, small values), never markup. Props that fail to
 * decode fall back to the host's generic attachment row.
 */
export interface MessageViewRegistration<P> {
  readonly slot: "message.view";
  /** `<packId>.<name>`; equals the attachment's `miniappId`. */
  readonly id: string;
  readonly props: Schema.Decoder<P>;
  readonly component: ComponentType<MessageViewProps<P>>;
  /** `lane` (default) keeps the message column width; `fullBleed` spans the thread width. */
  readonly layout?: "lane" | "fullBleed";
}

export interface WebActivateContext {
  readonly packId: string;
  /** Throws if `id` is not `<packId>.<name>` or is already registered. */
  registerView<P>(registration: MessageViewRegistration<P>): void;
}

export type WebActivate = (context: WebActivateContext) => void;

/** The default export of a pack's web entry. */
export const defineWebActivate = (activate: WebActivate): WebActivate => activate;

// ── Host primitives ──────────────────────────────────────────────────────────────────────────
// They own their look: pick a variant and size; layout belongs on the parent element.

export type PackButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "ghost-muted"
  | "destructive";
export type PackButtonSize = "default" | "sm" | "xs" | "micro" | "icon-sm" | "icon-micro";
export interface PackButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "style"
> {
  readonly variant?: PackButtonVariant;
  readonly size?: PackButtonSize;
}

export type PackBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "info"
  | "success"
  | "warning"
  | "error";
export interface PackBadgeProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "className" | "style"
> {
  readonly variant?: PackBadgeVariant;
  readonly size?: "default" | "sm";
}

export interface PackSkeletonProps {
  /** Width and height only: a skeleton's size is its content's. */
  readonly className?: string;
  readonly shape?: "block" | "card" | "pill";
}

/** Chat markdown. Raw HTML is shown as text, never parsed. */
export interface PackMarkdownProps {
  readonly text: string;
}

// ── Pack documents (the pack's own store) ────────────────────────────────────────────────────

/** One stored document. `doc` is the pack's own JSON: decode it before use. */
export interface PackDoc {
  readonly key: string;
  readonly version: number;
  readonly doc: unknown;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}

/** `unavailable`: this host has no pack store, or the pack does not declare `store:v1`. */
export type PackDocumentState<V> =
  | { readonly status: "unavailable" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: V };

/** Everything `@t3team/pack-ui` exports at runtime, as the host must implement it. */
export interface PackUiHostKit {
  readonly Button: ComponentType<PackButtonProps>;
  readonly Badge: ComponentType<PackBadgeProps>;
  readonly Skeleton: ComponentType<PackSkeletonProps>;
  readonly Markdown: ComponentType<PackMarkdownProps>;
  /** Live document `key` of the calling pack's `collection`; `null` when it does not exist. */
  readonly usePackDocument: (collection: string, key: string) => PackDocumentState<PackDoc | null>;
  /** Live documents of the calling pack's `collection`, optionally under a key prefix. */
  readonly usePackDocuments: (
    collection: string,
    options?: { readonly prefix?: string },
  ) => PackDocumentState<ReadonlyArray<PackDoc>>;
}
