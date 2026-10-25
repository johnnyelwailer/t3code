import type { ComponentType } from "react";

export interface ConnectionsSettingsProps {
  readonly request: (service: string, path: string, body?: object) => Promise<unknown>;
  readonly connect: (pairingUrl: string) => Promise<void>;
}

export interface ConnectionsSettingsRegistration {
  readonly slot: "settings.connections";
  readonly id: string;
  readonly component: ComponentType<ConnectionsSettingsProps>;
}
