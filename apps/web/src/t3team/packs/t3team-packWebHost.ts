/**
 * Runs the distribution's pack web modules (`@t3code/distribution-web`) into a view registry,
 * each with a context bound to its own pack id.
 *
 * A pack may only register ids in its own namespace (`<packId>.<name>`), so one pack can never
 * replace another pack's view or a host view. Activation is all-or-nothing per pack: a module that
 * throws, or registers a bad or taken id, registers nothing and is reported in the console. A
 * broken pack must not take the app down; its attachments fall back to the generic attachment row.
 */
import type { MessageViewRegistration, WebActivate } from "@t3team/pack-ui/contract";

import { bindPackMessageView, type PackViewContext } from "./t3team-PackMessageView";
import type { MessageViewEntry, ViewRegistry } from "./t3team-viewRegistry";

/** One pack web module, as `@t3code/distribution-web` lists it. */
export interface PackWebActivation {
  readonly packId: string;
  readonly activate: WebActivate;
}

export function activatePackWebModule<Ctx extends PackViewContext>(
  registry: ViewRegistry<Ctx>,
  { packId, activate }: PackWebActivation,
): void {
  const pending = new Map<string, MessageViewEntry<Ctx>>();
  const registerView = <P>(registration: MessageViewRegistration<P>) => {
    const { id } = registration;
    if (registration.slot !== "message.view") {
      throw new Error(`Pack ${packId}: slot "${String(registration.slot)}" is not supported`);
    }
    if (!id.startsWith(`${packId}.`) || id.length <= packId.length + 1) {
      throw new Error(`Pack ${packId}: view id "${id}" must be "${packId}.<name>"`);
    }
    if (registry.has(id) || pending.has(id)) {
      throw new Error(`Pack ${packId}: view "${id}" is already registered`);
    }
    pending.set(id, {
      id,
      owner: { kind: "pack", packId },
      placement: "row",
      layout: registration.layout ?? "lane",
      bind: bindPackMessageView(packId, registration),
    });
  };
  activate({ packId, registerView });
  for (const entry of pending.values()) registry.register(entry);
}

export function activatePackWebModules<Ctx extends PackViewContext>(
  registry: ViewRegistry<Ctx>,
  activations: ReadonlyArray<PackWebActivation>,
): void {
  for (const activation of activations) {
    try {
      activatePackWebModule(registry, activation);
    } catch (error) {
      console.error(`[t3team] pack ${activation.packId} web module failed to activate`, error);
    }
  }
}
