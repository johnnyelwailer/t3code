import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { ThreadManagementProviderInstanceDisabledError } from "./ThreadManagementService.ts";

describe("disabled provider message", () => {
  it("names the provider and says where to turn it on", () => {
    const { message } = new ThreadManagementProviderInstanceDisabledError({
      projectId: ProjectId.make("project-polassist"),
      instanceId: ProviderInstanceId.make("claude-work"),
    });

    expect(message).toContain('"claude-work" provider');
    expect(message).toContain("project-polassist");
    expect(message).toContain("Settings → Providers");
    expect(message).toContain("this project's provider settings");
    expect(message).toContain("another provider");
  });
});
