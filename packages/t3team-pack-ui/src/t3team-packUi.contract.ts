/**
 * `pack-ui:1` — the contract between a pack's web module and the host web app.
 *
 * A pack's web entry (`contents.views`, capability `view:v1`) default-exports a
 * `defineWebActivate(...)`. The host runs it once at boot with a context bound to the pack id; the
 * pack registers views into named slots. Host primitives (`Button`, `Markdown`, …) are typed here
 * and implemented by the host app, which aliases `@t3team/pack-ui` to its implementation, so there
 * is exactly one copy of each primitive and a pack never imports host internals.
 *
 * Variant and size names are part of the contract: renaming one is a breaking change.
 *
 * A pack declares the versions it was written against in its manifest,
 * `compatibility.hostCapabilities: ["pack-ui:1"]` (or a range, `"pack-ui:1-2"`); the host build
 * refuses a pack web module that does not include the host's `PACK_UI_VERSION`.
 */
import type { ComponentType } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type * as Schema from "effect/Schema";

import type {
  ChangeRequestSummaryRegistration,
  DashboardWidgetRegistration,
  MyWorkChangeRequestRegistration,
  SidecarSectionRegistration,
} from "./t3team-packUi.slots.ts";

/** Bumped on a breaking change to anything in this file. */
export const PACK_UI_VERSION = 1;

/**
 * The slots a view can be registered into. Only slots the host renders are listed. A registration
 * is keyed by `(slot, id)`; the slots other than `message.view` are in `t3team-packUi.slots.ts`.
 */
export type ViewSlot =
  | "message.view"
  | "changeRequest.summary"
  | "myWork.changeRequest"
  | "dashboard.widget"
  | "sidecar.section";

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

/** Everything `registerView` takes; `slot` says which. */
export type ViewRegistration<P> =
  | MessageViewRegistration<P>
  | ChangeRequestSummaryRegistration
  | MyWorkChangeRequestRegistration
  | DashboardWidgetRegistration
  | SidecarSectionRegistration;

export interface WebActivateContext {
  readonly packId: string;
  /** Throws if `id` is not `<packId>.<name>` or is already registered in that slot. */
  registerView<P>(registration: ViewRegistration<P>): void;
}

export type WebActivate = (context: WebActivateContext) => void;

/** The default export of a pack's web entry. */
export const defineWebActivate = (activate: WebActivate): WebActivate => activate;

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

export * from "./t3team-packUi.slots.ts";
export * from "./t3team-packUi.primitives.ts";
export * from "./t3team-packUi.overlays.ts";
export * from "./t3team-packUi.icons.ts";
export * from "./t3team-packUi.navigation.ts";
export type {
  PackClassValue,
  PackRecipeLaunchInput,
  PackRecipeLaunchResult,
  PackUiHostKit,
} from "./t3team-packUi.hostKit.ts";
