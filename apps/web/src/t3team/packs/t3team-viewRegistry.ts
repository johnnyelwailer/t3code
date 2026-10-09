/**
 * The one registry of views, keyed by `(slot, id)`. Host views and pack views register into the
 * same table: the timeline routes a `{ kind: "view" }` attachment by looking it up here, and each
 * other slot renders whatever is registered for it (`t3team-ViewSlot.tsx`, the dashboard widget
 * and sidecar section registries).
 *
 * No pack loading and no app wiring: `t3team-packWebHost.ts` fills it from pack web modules, and
 * `t3team-appViewRegistry.ts` owns the app's instance.
 */
import type {
  ChangeRequestSummaryProps,
  MyWorkChangeRequestProps,
  ViewSlot,
} from "@t3team/pack-ui/contract";
import type { DashboardWidgetDefinition } from "@t3team/sdk/placements";
import type { SidecarSectionDefinition } from "@t3tools/project-recipes";
import type { ComponentType, ReactNode } from "react";

import type { DashboardWidgetProps } from "~/t3team/t3team-dashboardWidgetRegistry";
import type { T3TeamSidecarSectionComponent } from "~/t3team/t3team-sidecarSectionRegistry";

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
  readonly slot: "message.view";
  readonly id: string;
  readonly owner: ViewOwner;
  readonly placement: MessageViewPlacement;
  readonly layout: "lane" | "fullBleed";
  readonly bind: (props: unknown) => ((context: Ctx) => ReactNode) | null;
}

/** A slot the host renders with props of its own: nothing to decode, just a component. */
interface ComponentViewEntry<S extends ViewSlot, Props> {
  readonly slot: S;
  readonly id: string;
  readonly owner: ViewOwner;
  readonly component: ComponentType<Props>;
}

/** The widget and section entries keep the definition the host places them by. */
export type DashboardWidgetEntry = ComponentViewEntry<"dashboard.widget", DashboardWidgetProps> & {
  readonly definition: DashboardWidgetDefinition;
};
export interface SidecarSectionEntry {
  readonly slot: "sidecar.section";
  readonly id: string;
  readonly owner: ViewOwner;
  readonly definition: SidecarSectionDefinition;
  readonly component: T3TeamSidecarSectionComponent;
}

export type ViewEntry<Ctx> =
  | MessageViewEntry<Ctx>
  | ComponentViewEntry<"changeRequest.summary", ChangeRequestSummaryProps>
  | ComponentViewEntry<"myWork.changeRequest", MyWorkChangeRequestProps>
  | DashboardWidgetEntry
  | SidecarSectionEntry;

export type ViewEntryFor<S extends ViewSlot, Ctx> = Extract<ViewEntry<Ctx>, { readonly slot: S }>;

export interface ViewRegistry<Ctx> {
  /** Throws when `(slot, id)` is taken. The same id may exist in two different slots. */
  register(entry: ViewEntry<Ctx>): void;
  has(slot: ViewSlot, id: string): boolean;
  get<S extends ViewSlot>(slot: S, id: string): ViewEntryFor<S, Ctx> | undefined;
  /** One slot's entries in registration order: host views first, then packs in activation order. */
  list<S extends ViewSlot>(slot: S): ReadonlyArray<ViewEntryFor<S, Ctx>>;
}

export function createViewRegistry<Ctx>(): ViewRegistry<Ctx> {
  const entries = new Map<string, ViewEntry<Ctx>>();
  // Read on every render of a slot; rebuilt only when a view registers (at boot).
  const ordered = new Map<ViewSlot, ReadonlyArray<ViewEntry<Ctx>>>();
  const key = (slot: ViewSlot, id: string) => `${slot}\u0000${id}`;
  return {
    register(entry) {
      const k = key(entry.slot, entry.id);
      if (entries.has(k)) {
        throw new Error(`View "${entry.id}" is already registered for slot ${entry.slot}`);
      }
      entries.set(k, entry);
      ordered.set(entry.slot, [...(ordered.get(entry.slot) ?? []), entry]);
    },
    has: (slot, id) => entries.has(key(slot, id)),
    get: (slot, id) => entries.get(key(slot, id)) as ViewEntryFor<typeof slot, Ctx> | undefined,
    list: (slot) => (ordered.get(slot) ?? []) as ReadonlyArray<ViewEntryFor<typeof slot, Ctx>>,
  };
}
