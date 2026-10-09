/**
 * The app's view registry: the host's views for every slot, then every pack view the distribution
 * compiles in (`@t3code/distribution-web`), filled once, on the first lookup.
 *
 * Module cycle, on purpose: host views render rows and panels that themselves mount slots, which
 * read this registry. That is why it fills on first use rather than at module load: nothing
 * crosses the cycle while modules evaluate, so the load order does not matter.
 */
import { webActivations } from "@t3code/distribution-web";

import type { MessageViewRowContext } from "~/t3team/chat/t3team-hostMessageViews";
import { HOST_MESSAGE_VIEWS } from "~/t3team/chat/t3team-hostMessageViews";
import { hostDashboardWidgetViews } from "~/t3team/t3team-dashboardWidgetRegistry";
import { hostSidecarSectionViews } from "~/t3team/t3team-sidecarSectionRegistry";

import { activatePackWebModules, type PackWebActivation } from "./t3team-packWebHost";
import { createViewRegistry, type ViewRegistry } from "./t3team-viewRegistry";

const registry = createViewRegistry<MessageViewRowContext>();
let filled = false;

export function appViewRegistry(): ViewRegistry<MessageViewRowContext> {
  if (!filled) {
    filled = true;
    for (const entry of HOST_MESSAGE_VIEWS) registry.register(entry);
    for (const entry of hostDashboardWidgetViews()) registry.register(entry);
    for (const entry of hostSidecarSectionViews()) registry.register(entry);
    activatePackWebModules(registry, webActivations);
  }
  return registry;
}

/** Activate more pack web modules — for stories and tests, which have no distribution. */
export function activateAppViewPacks(activations: ReadonlyArray<PackWebActivation>): void {
  activatePackWebModules(appViewRegistry(), activations);
}
