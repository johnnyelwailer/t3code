import { assert, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { chatGptModels } from "./CodexChatGptModels.ts";
import { applyCodexModelCatalog } from "./codexModelCatalog.ts";
import { BUNDLED_MODEL_MANIFEST, resolveProviderCatalog } from "./ModelManifest.ts";
import { buildUnavailableProviderSnapshot } from "./unavailableProviderSnapshot.ts";

it.effect(
  "classifies managed discovery replacements from the manifest before catalog visibility",
  () =>
    Effect.gen(function* () {
      const driver = ProviderDriverKind.make("codex");
      const catalog = resolveProviderCatalog(BUNDLED_MODEL_MANIFEST, driver)!;
      const entries = catalog.models.slice(0, 7);
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              models: [
                ...entries.map((entry) => ({
                  slug: entry.slug,
                  display_name: entry.name,
                  visibility: "list",
                })),
                { slug: "account-only", display_name: "Account only", visibility: "list" },
              ],
            }),
          ),
        ),
      );
      const draft = yield* buildUnavailableProviderSnapshot({
        driverKind: driver,
        instanceId: ProviderInstanceId.make("managed-codex"),
        reason: "test",
      });
      // No native models: discovery must classify even models the installed CLI never listed.
      const models = yield* chatGptModels("test-token", []).pipe(
        Effect.provideService(HttpClient.HttpClient, http),
      );
      const result = applyCodexModelCatalog({ ...draft, models }, catalog);
      assert.deepEqual(
        result.models.map((model) => [model.slug, model.isLegacy ?? false]),
        [
          ...entries.map((entry) => [entry.slug, entry.status === "legacy"]),
          ["account-only", false],
        ],
      );
      assert.deepEqual(
        result.models.map((model) => model.name),
        [...entries.map((entry) => entry.name), "Account only"],
      );
    }),
);
