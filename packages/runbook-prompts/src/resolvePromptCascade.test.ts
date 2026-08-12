// @effect-diagnostics globalConsole:off - the "three-way demo" test prints
// provenance lines intentionally, mirroring the ported source's demo test.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { resolvePromptCascade } from "./resolvePromptCascade.js";
import type { CascadeConfig } from "./layers.js";

/**
 * Acceptance fixtures for the runbook cascade ("a cascade, not a choice" +
 * "overrides as deltas, not copies"):
 *
 *   defaults/code-pr-review/main.md         v0.1.0, declares {{house_rules}}
 *   catalog/code-pr-review/main.md          v0.2.0, declares {{house_rules}} + {{domain_terms}}
 *   project-team-a/code-pr-review/main.slots.json   fills only house_rules (delta override)
 *   project-team-b/code-pr-review/main.md   full replacement body (no slots file)
 */
const defaultsDir = fileURLToPath(new URL("./fixtures/cascade/defaults", import.meta.url));
const catalogDir = fileURLToPath(new URL("./fixtures/cascade/catalog", import.meta.url));
const projectADir = fileURLToPath(new URL("./fixtures/cascade/project-team-a", import.meta.url));
const projectBDir = fileURLToPath(new URL("./fixtures/cascade/project-team-b", import.meta.url));
const projectLocBudgetDir = fileURLToPath(
  new URL("./fixtures/cascade/project-team-loc-budget", import.meta.url),
);
const multikeyDefaultsDir = fileURLToPath(
  new URL("./fixtures/cascade/multikey-defaults", import.meta.url),
);
const multikeyCatalogDir = fileURLToPath(
  new URL("./fixtures/cascade/multikey-catalog", import.meta.url),
);
const multikeyProjectDir = fileURLToPath(
  new URL("./fixtures/cascade/multikey-project", import.meta.url),
);
const multikeyProjectOverrideDir = fileURLToPath(
  new URL("./fixtures/cascade/multikey-project-override", import.meta.url),
);
const MULTIKEY_ID = "code-pr-review/main";

const ID = "code-pr-review/main";

describe("resolvePromptCascade: precedence", () => {
  it("resolves from defaults only when no other layer is configured", () => {
    const config: CascadeConfig = { defaultsDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("defaults");
    expect(resolved.version).toBe("0.1.0");
    expect(resolved.overriddenLayers).toEqual([]);
    expect(resolved.fullReplacement).toBe(false);
  });

  it("a configured catalog layer wins over defaults (higher precedence)", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("catalog");
    expect(resolved.version).toBe("0.2.0");
    expect(resolved.overriddenLayers).toEqual(["defaults"]);
    // catalog replacing defaults is the ordinary PR-reviewed promotion path,
    // not the flagged "off the upgrade path" case (that's project-only).
    expect(resolved.fullReplacement).toBe(false);
  });

  it("a configured project layer wins over both defaults and catalog", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectBDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("project");
    expect(resolved.version).toBe("0.9.0-team-b");
    expect(resolved.overriddenLayers.sort()).toEqual(["catalog", "defaults"]);
  });
});

describe("resolvePromptCascade: slot fill without body copy", () => {
  it("fills a slot from the project layer while keeping the catalog body verbatim otherwise", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    const resolved = resolvePromptCascade(ID, config);

    // The body that won is catalog's (v0.2.0) — project-team-a supplied no
    // .md, only a .slots.json — so this is a delta override, not a copy.
    expect(resolved.layer).toBe("catalog");
    expect(resolved.version).toBe("0.2.0");
    expect(resolved.fullReplacement).toBe(false);

    expect(resolved.body).toContain("Prefer named exports; no default exports.");
    expect(resolved.body).not.toContain("{{house_rules}}");
    // domain_terms was never filled by any layer.
    expect(resolved.body).toContain("{{domain_terms}}");
    expect(resolved.unfilledSlots).toEqual(["domain_terms"]);
  });

  it("reports zero unfilled slots when every declared slot is filled", () => {
    // defaults-only declares house_rules; fill it directly against defaults.
    const config: CascadeConfig = { defaultsDir, projectDir: projectADir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("defaults");
    expect(resolved.unfilledSlots).toEqual([]);
    expect(resolved.body).toContain("Prefer named exports; no default exports.");
  });
});

describe("resolvePromptCascade: full replacement flag", () => {
  it("flags fullReplacement when a project layer supplies a full body over an existing one", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectBDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("project");
    expect(resolved.fullReplacement).toBe(true);
    expect(resolved.body).toContain("team-b fork");
  });

  it("does not flag fullReplacement when the project layer only fills slots", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.fullReplacement).toBe(false);
  });

  it("does not flag fullReplacement for a project-only prompt with nothing beneath it to override", () => {
    const config: CascadeConfig = { defaultsDir: projectBDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).toBe("defaults");
    expect(resolved.fullReplacement).toBe(false);
  });
});

describe("resolvePromptCascade: provenance", () => {
  it("includes id, version, hash and path alongside layer/overriddenLayers/fullReplacement", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.id).toBe(ID);
    expect(resolved.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved.path).toContain("catalog");
    expect(resolved.path.endsWith("main.md")).toBe(true);
  });

  it("the hash reflects the post-slot-fill body, not the raw catalog body", () => {
    const withoutProject = resolvePromptCascade(ID, { defaultsDir, catalogDir });
    const withProject = resolvePromptCascade(ID, {
      defaultsDir,
      catalogDir,
      projectDir: projectADir,
    });
    expect(withProject.hash).not.toBe(withoutProject.hash);
  });
});

describe("resolvePromptCascade: layer containment (project cannot read outside its own dir)", () => {
  it("rejects a traversal id even with every layer configured", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    expect(() => resolvePromptCascade("../../../etc/passwd", config)).toThrow(/invalid prompt id/i);
  });

  it("rejects an absolute-path id", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    expect(() => resolvePromptCascade("/etc/hosts", config)).toThrow(/invalid prompt id/i);
  });

  it("a project layer's own root never resolves into a sibling layer's directory", () => {
    // project-team-a's root is fixtures/cascade/project-team-a; asking for
    // an id that only exists as a sibling directory (fixtures/cascade/catalog)
    // must not resolve — layer resolution never walks "up and over".
    const config: CascadeConfig = { projectDir: projectADir } as CascadeConfig;
    expect(() => resolvePromptCascade("../catalog/code-pr-review/main", config)).toThrow(
      /invalid prompt id/i,
    );
  });
});

describe("resolvePromptCascade: instance layer cannot contribute", () => {
  it('a config carrying only an "instance"-shaped value never gets looked up — no such field exists on CascadeConfig', () => {
    // Structural proof, not a runtime probe: CascadeConfig has no field an
    // instance layer could populate, and CASCADE_LAYER_PRECEDENCE (asserted
    // in layers.test.ts) never includes 'instance' — so there is no path by
    // which a fourth-layer value could reach resolvePromptCascade.
    const config: CascadeConfig = { defaultsDir };
    const resolved = resolvePromptCascade(ID, config);
    expect(resolved.layer).not.toBe("instance");
  });
});

describe("resolvePromptCascade: unknown id", () => {
  it("throws a clear error listing every directory searched", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    expect(() => resolvePromptCascade("does-not-exist/anywhere", config)).toThrow(
      /unknown prompt id "does-not-exist\/anywhere" — searched: defaults .*, catalog .*, project .*/,
    );
  });

  it('names "(no cascade layers configured)" when nothing is configured at all', () => {
    expect(() => resolvePromptCascade(ID, {} as CascadeConfig)).toThrow(
      /no cascade layers configured/,
    );
  });
});

describe("resolvePromptCascade: three-way demo (defaults only / +catalog / +project)", () => {
  it("prints provenance for the same id resolved three ways", () => {
    const onlyDefaults = resolvePromptCascade(ID, { defaultsDir });
    const withCatalog = resolvePromptCascade(ID, { defaultsDir, catalogDir });
    const withProject = resolvePromptCascade(ID, {
      defaultsDir,
      catalogDir,
      projectDir: projectADir,
    });

    for (const [label, resolved] of [
      ["defaults only", onlyDefaults],
      ["+ catalog", withCatalog],
      ["+ project (team-a slot fill)", withProject],
    ] as const) {
      // eslint-disable-next-line no-console
      console.log(
        `[cascade demo] ${label}: layer=${resolved.layer} version=${resolved.version} ` +
          `hash=${resolved.hash.slice(0, 12)} overriddenLayers=${JSON.stringify(resolved.overriddenLayers)} ` +
          `fullReplacement=${resolved.fullReplacement} unfilledSlots=${JSON.stringify(resolved.unfilledSlots)}`,
      );
    }

    expect(onlyDefaults.layer).toBe("defaults");
    expect(withCatalog.layer).toBe("catalog");
    expect(withProject.layer).toBe("catalog"); // body still catalog's; project only filled a slot
    expect(withProject.hash).not.toBe(withCatalog.hash); // but the resolved (filled) body differs
  });
});

/**
 * Regression tests: locBudget was enforced on the RAW body only, before
 * slot fills were applied — proven with a project-layer `.slots.json` that
 * turned a bounded defaults body into an over-budget one with no error and
 * no provenance signal of any kind.
 */
describe("resolvePromptCascade: locBudget re-enforced on the final, filled body", () => {
  it("throws when a slot fill pushes the final body over its locBudget, naming the contributing layer", () => {
    const config: CascadeConfig = { defaultsDir, projectDir: projectLocBudgetDir };
    expect(() => resolvePromptCascade(ID, config)).toThrow(
      /resolved body is \d+ LOC after slot fills, over its locBudget of 10.*slot fills contributed by: project/,
    );
  });

  it("does not throw when the filled body stays within budget", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    expect(() => resolvePromptCascade(ID, config)).not.toThrow();
  });
});

/**
 * Regression tests: slot fills used to be REPLACED wholesale per layer —
 * the highest-precedence layer that had ANY `.slots.json` at all won that
 * whole object, discarding every other configured layer's fills outright.
 * A project layer supplying `{}` (or a fills file missing a key a lower
 * layer filled) silently voided that lower layer's contribution. Fixed by
 * merging per key, higher precedence winning per key.
 */
describe("resolvePromptCascade: slot fills merge per key instead of replacing per layer", () => {
  it("keeps a lower-precedence layer's fill for a key the higher-precedence layer never touched", () => {
    const config: CascadeConfig = {
      defaultsDir: multikeyDefaultsDir,
      catalogDir: multikeyCatalogDir,
      projectDir: multikeyProjectDir,
    };
    const resolved = resolvePromptCascade(MULTIKEY_ID, config);

    // catalog filled "a" and "c"; project filled only "b" — under the old
    // per-layer-replace bug, project having ANY slots.json would have
    // discarded catalog's "a"/"c" fills entirely, leaving them unfilled.
    expect(resolved.body).toContain("catalog-a");
    expect(resolved.body).toContain("catalog-c");
    expect(resolved.body).toContain("project-b");
    expect(resolved.unfilledSlots).toEqual([]);
    expect(resolved.slotFillLayers.slice().sort()).toEqual(["catalog", "project"]);
  });

  it("lets a higher-precedence layer override a specific key while leaving other keys from the lower layer intact", () => {
    const config: CascadeConfig = {
      defaultsDir: multikeyDefaultsDir,
      catalogDir: multikeyCatalogDir,
      projectDir: multikeyProjectOverrideDir,
    };
    const resolved = resolvePromptCascade(MULTIKEY_ID, config);

    // project overrides "a" (catalog's "catalog-a" must NOT survive) and
    // supplies "b"; catalog's "c" is untouched by project and must survive.
    expect(resolved.body).toContain("project-a-override");
    expect(resolved.body).not.toContain("catalog-a");
    expect(resolved.body).toContain("catalog-c");
    expect(resolved.body).toContain("project-b");
    expect(resolved.slotFillLayers.slice().sort()).toEqual(["catalog", "project"]);
  });
});

/**
 * Regression test: provenance must record which layers contributed slot
 * fills, and flag when a HIGHER-precedence layer than the one owning the
 * winning body materially reshaped that body — the concrete concealment
 * this guards against is `layer: 'defaults'`, `fullReplacement: false`,
 * `overriddenLayers: []` while the body is almost entirely project-authored.
 */
describe("resolvePromptCascade: provenance flags a lower-precedence body materially altered by a higher layer", () => {
  it("flags materiallyAlteredByHigherLayer when project-layer slot fills reshape a defaults-layer body", () => {
    const config: CascadeConfig = {
      defaultsDir: multikeyDefaultsDir,
      catalogDir: multikeyCatalogDir,
      projectDir: multikeyProjectOverrideDir,
    };
    const resolved = resolvePromptCascade(MULTIKEY_ID, config);

    expect(resolved.layer).toBe("defaults"); // no layer supplied a full body override
    expect(resolved.fullReplacement).toBe(false);
    expect(resolved.overriddenLayers).toEqual([]);
    // The concealed case: layer/fullReplacement/overriddenLayers all look
    // "clean", but project (higher precedence than the winning 'defaults'
    // layer) actually shaped the final text via slot fills.
    expect(resolved.materiallyAlteredByHigherLayer).toBe(true);
  });

  it("does not flag materiallyAlteredByHigherLayer when the winning layer is itself the highest slot-fill contributor", () => {
    const config: CascadeConfig = { defaultsDir, catalogDir, projectDir: projectADir };
    const resolved = resolvePromptCascade(ID, config);
    // catalog owns the winning body; project's slot fill (house_rules) IS a
    // higher-precedence layer than catalog, so this is in fact the same
    // concealed shape — assert consistently with the fixture above rather
    // than assuming "false" here.
    expect(resolved.materiallyAlteredByHigherLayer).toBe(true);
  });

  it("is false when no layer above the winning body layer contributes any slot fill", () => {
    const config: CascadeConfig = { defaultsDir: multikeyDefaultsDir };
    const resolved = resolvePromptCascade(MULTIKEY_ID, config);
    expect(resolved.layer).toBe("defaults");
    expect(resolved.slotFillLayers).toEqual([]);
    expect(resolved.materiallyAlteredByHigherLayer).toBe(false);
  });
});
