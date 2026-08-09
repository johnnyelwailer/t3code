/**
 * Pack-contributed theming and first-run setup-profile schemas, surfaced on
 * `ExecutionEnvironmentDescriptor` as the optional `appearance` /
 * `setupProfiles` fields (see `environment.ts`).
 *
 * `EnvironmentAppearance` is the client-facing shape of a pack theme (brand
 * assets, color tokens, typography, and one-time appearance defaults).
 * `EnvironmentSetupProfile` is the presentation view of a pack-contributed
 * project-setup profile ("role") shown in the first-run setup wizard;
 * behavior (recipe weights, communication style) stays server-side and is
 * not part of this client-facing payload.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const EnvironmentAppearance = Schema.Struct({
  themeId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  productName: Schema.optionalKey(TrimmedNonEmptyString),
  publisher: Schema.optionalKey(TrimmedNonEmptyString),
  labels: Schema.optionalKey(
    Schema.Struct({
      appName: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
  defaultMode: Schema.optionalKey(Schema.Literals(["light", "dark", "system"])),
  brand: Schema.optionalKey(
    Schema.Struct({
      mark: Schema.optionalKey(TrimmedNonEmptyString),
      markDark: Schema.optionalKey(TrimmedNonEmptyString),
      wordmark: Schema.optionalKey(TrimmedNonEmptyString),
      wordmarkDark: Schema.optionalKey(TrimmedNonEmptyString),
      displayFont: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
  colors: Schema.Struct({
    light: Schema.Record(Schema.String, Schema.String),
    dark: Schema.Record(Schema.String, Schema.String),
  }),
  typography: Schema.optionalKey(
    Schema.Struct({
      sans: Schema.optionalKey(Schema.String),
      mono: Schema.optionalKey(Schema.String),
      display: Schema.optionalKey(Schema.String),
    }),
  ),
  shape: Schema.optionalKey(Schema.Struct({ radius: Schema.optionalKey(Schema.String) })),
  density: Schema.optionalKey(Schema.Number),
  /**
   * Starting values for user-owned client appearance settings, carried from the pack theme's
   * `appearanceDefaults`. Applied once per distinct set of values, never over a later user choice
   * — see `t3team-packAppearanceDefaults.ts`.
   */
  appearanceDefaults: Schema.optionalKey(
    Schema.Struct({
      sidebarLens: Schema.optionalKey(Schema.Literals(["code", "work"])),
      glassOpacity: Schema.optionalKey(Schema.Number),
    }),
  ),
});
export type EnvironmentAppearance = typeof EnvironmentAppearance.Type;

/**
 * Presentation view of a pack-contributed project-setup profile ("role"),
 * surfaced to the first-run setup wizard. Behavior (recipe weights, communication
 * style) stays server-side and is not part of this client-facing payload.
 */
export const EnvironmentSetupProfile = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  badge: TrimmedNonEmptyString,
  bullets: Schema.Array(TrimmedNonEmptyString),
  category: Schema.Literals(["product", "delivery", "engineering", "operations", "security"]),
  iconDataUrl: Schema.optionalKey(TrimmedNonEmptyString),
  default: Schema.optionalKey(Schema.Boolean),
});
export type EnvironmentSetupProfile = typeof EnvironmentSetupProfile.Type;
