// @vitest-environment jsdom
// @effect-diagnostics nodeBuiltinImport:off - reads the fixture pack's files as the build does.
/**
 * The kit fixture pack, end to end: its manifest passes the build's pack-ui gate, every import in
 * its source passes the build's import boundary, and its web module activates into the view
 * registry and renders every primitive through `@t3team/pack-ui` without tripping its error
 * boundary.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { PACK_UI_VERSION } from "@t3team/pack-ui/contract";
import { packWebImportProblem, readDistributionWebEntries } from "@t3team/packs/distribution-web";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import activateKitFixture from "./t3team-kit-fixture-pack/web/t3team-kitFixtureWeb";
import type { PackViewContext } from "./t3team-PackMessageView";
import { activatePackWebModule } from "./t3team-packWebHost";
import { createViewRegistry } from "./t3team-viewRegistry";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const packDir = NodePath.resolve(import.meta.dirname, "t3team-kit-fixture-pack");

describe("the pack-ui kit fixture pack", () => {
  it("passes the build's pack-ui version gate", () => {
    const entries = readDistributionWebEntries(packDir, { packUiVersion: PACK_UI_VERSION });

    expect(entries.map((entry) => entry.packId)).toEqual(["kitfixture"]);
  });

  it("imports nothing the build's import boundary refuses", () => {
    const webDir = NodePath.join(packDir, "web");
    const problems = NodeFS.readdirSync(webDir).flatMap((file) => {
      const importer = NodePath.join(webDir, file);
      const source = NodeFS.readFileSync(importer, "utf8");
      return [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].flatMap(([, specifier]) => {
        const problem = packWebImportProblem(specifier!, { importer, packDir });
        return problem === null ? [] : [`${file}: ${problem}`];
      });
    });

    expect(problems).toEqual([]);
  });

  it("renders every primitive through its registered view", async () => {
    const registry = createViewRegistry<PackViewContext>();
    activatePackWebModule(registry, { packId: "kitfixture", activate: activateKitFixture });
    const render = registry.get("kitfixture.showcase")?.bind({ title: "pack-ui:1" });
    const container = document.createElement("div");
    document.body.append(container);

    await act(async () => {
      createRoot(container).render(render?.({ threadRef: null, messageId: "m1" }));
    });

    expect(container.textContent).not.toContain("could not be shown");
    expect(container.textContent).toContain("pack-ui:1");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(container.querySelector('a[href^="file:"]')).toBeNull();
    container.remove();
  });
});
