import type { HostServiceDefinition } from "@t3team/pack-api";

const definitions = new Map<string, HostServiceDefinition>();

export function registerHostService(definition: HostServiceDefinition) {
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(definition.id)) {
    throw new Error("Host service id must be a pack identifier");
  }
  definitions.set(definition.id, definition);
}

export const hostServiceDefinitions = () => [...definitions.values()];
