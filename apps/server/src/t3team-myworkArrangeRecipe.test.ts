// @effect-diagnostics nodeBuiltinImport:off - the write test checks files in a temp dir.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { myWorkArrangeMode } from "./t3team-myworkArrangeMode.ts";
import { DIGEST_TICKET_SIGNATURE_SOURCE } from "./t3team-myworkArrangeDrift.ts";
import { renderMyWorkArrangeRecipe } from "./t3team-myworkArrangeRecipeTemplate.ts";
import { parseMyWorkArrangeRecipeSpec } from "./t3team-myworkArrangeRecipeSpec.ts";
import { writeMyWorkArrangeRecipe } from "./t3team-myworkArrangeRecipeWrite.ts";
import { T3TEAM_PROJECT_RECIPES_ROOT } from "./t3team-projectSetupShared.ts";
import { renderViewRecipe, VIEW_DRIFTED_SOURCE } from "./t3team-viewRecipeTemplate.ts";

const spec = {
  id: "my-work-maintain",
  title: "Keep My Work arranged",
  shortDescription: "Re-checks the board.",
  digestScope: "all",
  density: "compact",
  focus: 'Release blockers"; process.exit(1); "',
  noise: "Done tickets",
  everyHours: 4,
};

// The embedded sources are what ships; evaluate them as the workflow loader would.
const evaluate = <F>(source: string): F => new Function(`return (${source});`)() as F;
const signature = evaluate<(digest: unknown) => string>(DIGEST_TICKET_SIGNATURE_SOURCE);
const drifted = evaluate<(previous: string, next: string) => boolean>(VIEW_DRIFTED_SOURCE);

describe("t3team My Work arrange modes", () => {
  it("takes exactly one write, and channel only with a plan", () => {
    assert.deepEqual(myWorkArrangeMode({ plan: {}, channel: "draft" }), {
      ok: true,
      mode: { type: "plan", channel: "draft" },
    });
    assert.deepEqual(myWorkArrangeMode({ plan: {} }), {
      ok: true,
      mode: { type: "plan", channel: "live" },
    });
    assert.deepEqual(myWorkArrangeMode({ promote: true }), { ok: true, mode: { type: "promote" } });
    assert.isFalse(myWorkArrangeMode({}).ok);
    assert.isFalse(myWorkArrangeMode({ plan: {}, promote: true }).ok);
    assert.isFalse(myWorkArrangeMode({ promote: true, channel: "draft" }).ok);
    assert.isFalse(myWorkArrangeMode({ plan: {}, channel: "elsewhere" }).ok);
  });
});

describe("t3team view recipe drift", () => {
  it("signs a digest by its sorted ticket ids", () => {
    const digest = { projects: [{ tickets: [{ id: "b" }, { id: "a" }] }, { tickets: "x" }] };
    assert.equal(signature(digest), "a\nb");
    assert.equal(signature(null), "");
  });

  it("wakes the agent only when a quarter of the view changed", () => {
    assert.isFalse(drifted("a\nb\nc\nd", "a\nb\nc\nd"));
    assert.isFalse(drifted("a\nb\nc\nd\ne", "a\nb\nc\nd\nf"));
    assert.isTrue(drifted("a\nb\nc\nd", "a\nb\ne\nf"));
    assert.isTrue(drifted("", "a"));
  });
});

describe("t3team view recipe generation", () => {
  it("validates the interview spec", () => {
    assert.isTrue(parseMyWorkArrangeRecipeSpec(spec).ok);
    assert.isFalse(parseMyWorkArrangeRecipeSpec({ ...spec, id: "../escape" }).ok);
    assert.isFalse(parseMyWorkArrangeRecipeSpec({ ...spec, everyHours: 0 }).ok);
    assert.isFalse(parseMyWorkArrangeRecipeSpec({ ...spec, digestScope: "team" }).ok);
  });

  it("renders a project-scoped recipe on the My Work surface; user text stays quoted", () => {
    const parsed = parseMyWorkArrangeRecipeSpec(spec);
    if (!parsed.ok) throw new Error(parsed.message);
    const { recipeTs, workflowTs } = renderMyWorkArrangeRecipe(parsed.spec);
    assert.include(recipeTs, 'scope: "project"');
    assert.include(recipeTs, 'surfaces: ["project.dashboard.myWork"]');
    assert.include(recipeTs, '"./my-work-maintain.workflow.ts"');
    assert.include(workflowTs, 'tools.t3team.mywork.digest.read({ scope: "all" })');
    assert.include(workflowTs, '"integration.read", "view.state", "schedule"');
    assert.include(workflowTs, "4 * HOUR_MS");
    assert.include(workflowTs, "At most 3 sections");
    // The injected focus is inside one JSON string literal, never raw code.
    assert.notInclude(workflowTs, '"; process.exit(1); "');
    assert.include(workflowTs, '\\"; process.exit(1); \\"');
  });

  it("rejects a surface or read call outside the allowlist", () => {
    const base = {
      id: "x",
      title: "t",
      shortDescription: "s",
      surface: "project.dashboard.myWork",
      everyHours: 1,
      maintainPrompt: "p",
      readCall: "t3team.mywork.digest.read({})",
      signatureFunctionSource: DIGEST_TICKET_SIGNATURE_SOURCE,
    };
    assert.throws(() => renderViewRecipe({ ...base, surface: "x; drop" }));
    assert.throws(() => renderViewRecipe({ ...base, readCall: "process.exit(1)" }));
  });

  it.effect("writes recipe.ts and <id>.workflow.ts under .t3team/recipes/<id>", () =>
    Effect.gen(function* () {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-recipe-"));
      const written = yield* writeMyWorkArrangeRecipe(root, spec);
      assert.equal(
        written.workflowPath,
        `${T3TEAM_PROJECT_RECIPES_ROOT}/my-work-maintain/my-work-maintain.workflow.ts`,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(root, written.recipePath)));
      assert.isTrue(NodeFS.existsSync(NodePath.join(root, written.workflowPath)));

      const invalid = yield* writeMyWorkArrangeRecipe(root, { ...spec, id: "../x" }).pipe(
        Effect.exit,
      );
      assert.isTrue(Exit.isFailure(invalid));
      NodeFS.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
