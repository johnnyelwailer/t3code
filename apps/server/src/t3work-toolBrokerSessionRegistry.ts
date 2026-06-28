import type { ThreadId } from "@t3tools/contracts";

import type { T3workToolBinding } from "./t3work-toolBroker.ts";

const bindingsByThread = new Map<ThreadId, T3workToolBinding>();

export function setT3workToolBinding(binding: T3workToolBinding): void {
  bindingsByThread.set(binding.threadId, binding);
}

export function readT3workToolBinding(threadId: ThreadId): T3workToolBinding | undefined {
  return bindingsByThread.get(threadId);
}

export function clearT3workToolBinding(threadId: ThreadId): void {
  bindingsByThread.delete(threadId);
}

export function clearAllT3workToolBindings(): void {
  bindingsByThread.clear();
}
