import type { ComponentType } from "react";

export interface ConnectionsSettingsProps {
  readonly request: (service: string, path: string, body?: object) => Promise<unknown>;
  /** `label`: the name the environment is saved under; the server's own label otherwise. */
  readonly connect: (pairingUrl: string, options?: { readonly label?: string }) => Promise<void>;
}

export interface ConnectionsSettingsRegistration {
  readonly slot: "settings.connections";
  readonly id: string;
  readonly component: ComponentType<ConnectionsSettingsProps>;
}
