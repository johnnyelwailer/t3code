import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  resolveWorkflowAgentModel,
  setWorkflowAgentModelPolicy,
} from "./t3work-workflowAgentModelPolicy.ts";

afterEach(() => setWorkflowAgentModelPolicy("inherit"));

describe("workflow child-agent model policy", () => {
  it("inherits the launch model by default", () => {
    const launch = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4");
    expect(resolveWorkflowAgentModel(launch)).toBe(launch);
  });

  it("allows a distribution override", () => {
    const launch = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4");
    const override = createModelSelection(ProviderInstanceId.make("nexplore"), "nexplore/coding");
    setWorkflowAgentModelPolicy(override);
    expect(resolveWorkflowAgentModel(launch)).toBe(override);
  });
});
