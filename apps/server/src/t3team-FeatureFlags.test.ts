import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  clearPackFeatureFlags,
  registerPackFeatureFlags,
  replaceFeatureFlagDatabaseValues,
  replaceFeatureFlagPresetValues,
} from "@t3tools/project-context/t3teamFeatureFlags";

import * as FeatureFlags from "./t3team-FeatureFlags.ts";

const resetFlags = Effect.sync(() => {
  replaceFeatureFlagDatabaseValues(new Map());
  replaceFeatureFlagPresetValues(new Map());
  clearPackFeatureFlags();
  delete process.env[FeatureFlags.PACK_FEATURE_FLAGS_ENV];
});

const withFlags = <A, E>(effect: Effect.Effect<A, E, FeatureFlags.FeatureFlags>) =>
  resetFlags.pipe(
    Effect.andThen(
      Effect.sync(() => {
        replaceFeatureFlagPresetValues(new Map([["MYWORK_KANBAN", true]]), "nightly-dogfood");
        registerPackFeatureFlags([
          {
            key: "agent.machine_gate",
            group: "Agent",
            label: "Machine gate",
            description: "Heavy commands take a machine-wide slot.",
            defaultEnabled: false,
            requiresRestart: false,
          },
        ]);
      }),
    ),
    Effect.andThen(
      effect.pipe(
        Effect.provide(
          FeatureFlags.layer.pipe(Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
        ),
      ),
    ),
    Effect.ensuring(resetFlags),
  );

it.effect("lists every flag with its source and the installed preset", () =>
  withFlags(
    Effect.gen(function* () {
      const flags = yield* FeatureFlags.FeatureFlags;
      const view = yield* flags.view;
      assert.equal(view.preset, "nightly-dogfood");
      const kanban = view.flags.find((flag) => flag.key === "MYWORK_KANBAN");
      assert.deepInclude(kanban, { enabled: true, source: "preset", scope: "vendor" });
      const stateDir = view.flags.find((flag) => flag.key === "NEXI_STATE_DIR");
      assert.deepInclude(stateDir, { userToggleable: false, requiresRestart: true });
      assert.deepInclude(
        view.flags.find((flag) => flag.key === "agent.machine_gate"),
        { scope: "pack", group: "Agent", enabled: false },
      );
      assert.equal(
        process.env[FeatureFlags.PACK_FEATURE_FLAGS_ENV],
        '{"agent.machine_gate":false}',
      );
    }),
  ),
);

it.effect("a user value applies live, streams to subscribers and reaches the pack snapshot", () =>
  withFlags(
    Effect.scoped(
      Effect.gen(function* () {
        const flags = yield* FeatureFlags.FeatureFlags;
        const changes = yield* flags.subscribeChanges;
        const view = yield* flags.set({ key: "agent.machine_gate", enabled: true });
        assert.deepInclude(
          view.flags.find((flag) => flag.key === "agent.machine_gate"),
          { enabled: true, source: "user", restartPending: false },
        );
        const published = yield* Stream.runHead(changes);
        assert.equal(published._tag === "Some" && published.value["agent.machine_gate"], true);
        assert.equal(
          process.env[FeatureFlags.PACK_FEATURE_FLAGS_ENV],
          '{"agent.machine_gate":true}',
        );

        const cleared = yield* flags.set({ key: "MYWORK_KANBAN", enabled: false });
        assert.deepInclude(
          cleared.flags.find((flag) => flag.key === "MYWORK_KANBAN"),
          { enabled: false, source: "user" },
        );
        const reset = yield* flags.set({ key: "MYWORK_KANBAN", enabled: null });
        assert.deepInclude(
          reset.flags.find((flag) => flag.key === "MYWORK_KANBAN"),
          { enabled: true, source: "preset" },
        );
      }),
    ),
  ),
);

it.effect("a restart-only flag reports the pending restart and locked flags refuse writes", () =>
  withFlags(
    Effect.gen(function* () {
      const flags = yield* FeatureFlags.FeatureFlags;
      // Derived, not hardcoded: a default flip changes which value differs from the startup one.
      const atStartup = (yield* flags.view).flags.find((flag) => flag.key === "OPS_STALL_PROFILER");
      assert.isDefined(atStartup);
      assert.deepInclude(atStartup, { requiresRestart: true, restartPending: false });

      const desired = !atStartup.enabled;
      const changed = yield* flags.set({ key: "OPS_STALL_PROFILER", enabled: desired });
      assert.deepInclude(
        changed.flags.find((flag) => flag.key === "OPS_STALL_PROFILER"),
        { enabled: desired, requiresRestart: true, restartPending: true },
      );

      const restored = yield* flags.set({ key: "OPS_STALL_PROFILER", enabled: null });
      assert.deepInclude(
        restored.flags.find((flag) => flag.key === "OPS_STALL_PROFILER"),
        { enabled: atStartup.enabled, requiresRestart: true, restartPending: false },
      );

      const error = yield* Effect.flip(flags.set({ key: "NEXI_STATE_DIR", enabled: false }));
      assert.equal(error.category, "locked");
    }),
  ),
);
