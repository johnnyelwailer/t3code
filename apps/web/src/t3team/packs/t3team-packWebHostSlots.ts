/**
 * Turns a pack's registration for a slot other than `message.view` into a registry entry. Those
 * slots take no props schema, so there is nothing to decode but a definition: the data an
 * arrangement or a composition places the view by, decoded here with the SDK's own schema so a
 * pack's widget or section is exactly as valid as a bundled one. A bad definition throws, which
 * refuses the pack's whole activation (`t3team-packWebHost.ts`).
 */
import type { ViewRegistration } from "@t3team/pack-ui/contract";
import { DashboardWidgetDefinition, SidecarSectionDefinition } from "@t3team/sdk/placements";
import * as Schema from "effect/Schema";
import { createElement } from "react";

import { PackScopeContext } from "./t3team-packScope";
import type { MessageViewEntry, ViewEntry } from "./t3team-viewRegistry";

/** A registry entry that does not depend on the timeline's row context. */
export type SlotViewEntry = Exclude<ViewEntry<never>, MessageViewEntry<never>>;

const decodeWidget = Schema.decodeUnknownSync(DashboardWidgetDefinition);
const decodeSection = Schema.decodeUnknownSync(SidecarSectionDefinition);

export function packSlotEntry(
  packId: string,
  registration: Exclude<ViewRegistration<unknown>, { readonly slot: "message.view" }>,
): SlotViewEntry {
  const owner = { kind: "pack", packId } as const;
  const { id } = registration;
  switch (registration.slot) {
    case "changeRequest.summary":
    case "myWork.changeRequest":
      return { ...registration, owner } as SlotViewEntry;
    case "dashboard.widget":
    case "sidecar.section": {
      const { definition } = registration;
      if (definition.id !== id) {
        throw new Error(`Pack ${packId}: "${id}" has a definition with id "${definition.id}"`);
      }
      // The host's `component` key names a shell component; a pack's registration is the component.
      const decorated = { ...definition, component: id };
      return registration.slot === "dashboard.widget"
        ? {
            slot: registration.slot,
            id,
            owner,
            definition: decodeWidget(decorated),
            // The host's lane internals (the graph, the ticket map) are not part of the contract.
            component: (props) =>
              createElement(registration.component, {
                placement: props.placement,
                section: props.section,
              }),
          }
        : {
            slot: registration.slot,
            id,
            owner,
            definition: decodeSection(decorated),
            // The sidecar frames the section with its own error boundary; the pack scope is ours.
            component: (props) =>
              createElement(
                PackScopeContext.Provider,
                { value: packId },
                createElement(registration.component, props),
              ),
          };
    }
    default:
      throw new Error(
        `Pack ${packId}: slot "${String((registration as { slot: string }).slot)}" is not supported`,
      );
  }
}
