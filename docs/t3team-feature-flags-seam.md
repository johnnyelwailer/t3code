# Feature flags: registry, layering and the Features page

Every fork feature switch is one registry entry. The registry is the only metadata source: the server
resolves values from it, Settings → Features renders it, and distribution builds bake release presets
against its keys.

## Where things live

- `packages/project-context/src/t3teamFeatureFlags.ts`: the registry (host entries from
  `t3team-featureFlagDefinitions{Core,Work,Agent}.ts`), layering, pack registration. Each entry has a
  group (one of `FEATURE_FLAG_GROUPS`) and optional subgroup, label, description, code default,
  `requiresRestart`, optional `envAliases`, and `userToggleable: false` for flags a user value cannot
  reach.
- `packages/project-context/src/t3team-featureFlagPreset.ts`: release presets
  (`{ "flavor", "flags": { key: boolean } }`), installed from `T3TEAM_FLAG_PRESET`.
- `apps/server/src/persistence/Migrations/t3team-065_FeatureFlags.ts`: portable `feature_flags` DDL,
  registered as migration **101** (`persistence/Migrations.ts`). The rows are user values.
- `apps/server/src/t3team-featureFlagStore.ts`: read, write and remove user values.
- `apps/server/src/t3team-FeatureFlags.ts`: the service behind `server.getFeatureFlags`,
  `server.setFeatureFlag` and the `featureFlagsUpdated` config event.

## Layering

`NEXI_FF_<KEY>` (then each `envAliases` name) > user value > release preset > code default. Env values
`1`/`true`/`on` and `0`/`false`/`off` decide (trimmed, case-insensitive); anything else is not an
override. `<KEY>` is upper-cased with non-alphanumerics replaced by `_`, the portal's
`featureFlagEnvName` rule, so `agent.machine_gate` and `NEXI_FF_AGENT_MACHINE_GATE` name one switch.

## Startup order — the trap

`PROJECT_STATE_DIR` and other startup-only flags freeze when their modules evaluate. Two rules keep
them honest:

- The preset is installed before the CLI module graph loads: `bin.ts` awaits
  `t3team-featureFlagBoot.ts` first, `t3team-bin.ts` imports it as its first import. The desktop shell
  reads the packaged `flag-preset.json` and exports it as `T3TEAM_FLAG_PRESET`
  (`apps/desktop/src/app/t3team-desktopFlagPreset.ts`); WSL backends receive it through the forwarded
  env list.
- User values load when the `FeatureFlags` layer builds, which is the last layer provided in
  `server.ts` and therefore built first. A layer that reads a `requiresRestart` flag once must
  `yield* FeatureFlags.FeatureFlags` before reading it. A flag read before that layer exists (module
  scope, the desktop shell) cannot honor a user value: mark it `userToggleable: false`. That is why
  `NEXI_STATE_DIR` and `BACKEND_WATCHDOG` take env and preset only.

## Packs

A pack registers its own flags with `defineFeatureFlags` at activation (compiled-in distribution and
runtime packs alike; re-registering a key replaces it). The pack reads its flags in-process: its own
`NEXI_FF_<KEY>` read first, then the JSON snapshot `T3TEAM_PACK_FLAGS`, which the `FeatureFlags`
service writes at start and after every change. A pack key may not shadow a host key.

## Clients

`ServerConfig.featureFlags` carries every effective value; subscribers that send
`featureFlags: true` get `featureFlagsUpdated` events, so `requiresRestart: false` flags re-gate live.
The web reads them with `useFeatureFlag` (`apps/web/src/t3team/t3team-useFeatureFlag.ts`). The older
per-flag `ServerConfig` booleans stay for older clients.

## Settings → Features

Built from `server.getFeatureFlags`, gated by `SETTINGS_FEATURES_PAGE`. Each row shows the value, its
source (env, user, preset, default), a restart badge when a `requiresRestart` flag changed after this
start, and a reset that removes the user value. Writes need the settings-write scope. Env and
`userToggleable: false` rows are read-only.
