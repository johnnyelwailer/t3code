/**
 * Claude effort/thinking resolution on the V2 query options (critic G12): the fork's V1
 * `ClaudeAdapter.test` effort cases, so a silent effort downgrade surfaces as a test failure.
 */
import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import * as ClaudeAdapterV2 from "./ClaudeAdapterV2.ts";

const optionsFor = (model: string, options: NonNullable<ModelSelection["options"]>) =>
  ClaudeAdapterV2.makeClaudeQueryOptions({
    modelSelection: {
      instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
      model,
      options,
    },
    nativeThreadId: "t3team-effort-thread",
    resume: false,
    cwd: "/workspace",
  });

describe("Claude effort on V2 query options", () => {
  it.each(["claude-fable-5", "claude-fable-5-1", "claude-opus-5"])(
    "preserves xhigh effort for %s",
    (model) => {
      assert.equal(optionsFor(model, [{ id: "effort", value: "xhigh" }]).effort, "xhigh");
    },
  );

  it("maps xhigh to max for Opus 4.7", () => {
    assert.equal(optionsFor("claude-opus-4-7", [{ id: "effort", value: "xhigh" }]).effort, "max");
  });

  it("falls back to the default effort when Sonnet 4.6 is asked for unsupported max", () => {
    assert.equal(optionsFor("claude-sonnet-4-6", [{ id: "effort", value: "max" }]).effort, "high");
  });

  it("ignores adaptive effort for Haiku 4.5", () => {
    assert.isUndefined(optionsFor("claude-haiku-4-5", [{ id: "effort", value: "high" }]).effort);
  });

  it("forwards the thinking toggle into SDK settings for Haiku 4.5", () => {
    const options = optionsFor("claude-haiku-4-5", [{ id: "thinking", value: false }]);
    assert.deepInclude(options.settings, { alwaysThinkingEnabled: false });
  });
});
