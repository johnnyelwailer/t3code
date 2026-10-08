/**
 * The one registry of views, keyed by `(slot, id)`. Host views and pack views register into the
 * same table, so the timeline routes a `{ kind: "view" }` attachment by looking it up here
 * instead of by a hard-coded list of ids.
 *
 * No pack loading and no app wiring: `t3team-packWebHost.ts` fills it from pack web modules, and
 * `t3team-messageViewRegistry.ts` owns the app's instance.
 */
import type { ReactNode } from "react";

/** Who registered a view: the host app, or the id of the pack whose web module did. */
export type ViewOwner =
  | { readonly kind: "host" }
  | { readonly kind: "pack"; readonly packId: string };

/** Where a host `message.view` renders: as the whole row, or inside the generic system card. */
export type MessageViewPlacement = "row" | "card-body";

/**
 * A registered `message.view`. `bind` decodes attachment props and returns the view's renderer,
 * or `null` when the props do not decode — so the decoder and the component it feeds can never be
 * paired up wrongly. `Ctx` is what the renderer gets from the row it renders in.
 */
export interface MessageViewEntry<Ctx> {
  readonly id: string;
  readonly owner: ViewOwner;
  readonly placement: MessageViewPlacement;
  readonly layout: "lane" | "fullBleed";
  readonly bind: (props: unknown) => ((context: Ctx) => ReactNode) | null;
}

export interface ViewRegistry<Ctx> {
  register(entry: MessageViewEntry<Ctx>): void;
  has(id: string): boolean;
  get(id: string): MessageViewEntry<Ctx> | undefined;
  /** In registration order: host views first, then packs in activation order. */
  list(): ReadonlyArray<MessageViewEntry<Ctx>>;
}

export function createViewRegistry<Ctx>(): ViewRegistry<Ctx> {
  const entries = new Map<string, MessageViewEntry<Ctx>>();
  // Read on every timeline row render; rebuilt only when a view registers (at boot).
  let ordered: ReadonlyArray<MessageViewEntry<Ctx>> = [];
  return {
    register(entry) {
      if (entries.has(entry.id)) {
        throw new Error(`View "${entry.id}" is already registered for slot message.view`);
      }
      entries.set(entry.id, entry);
      ordered = [...entries.values()];
    },
    has: (id) => entries.has(id),
    get: (id) => entries.get(id),
    list: () => ordered,
  };
}
