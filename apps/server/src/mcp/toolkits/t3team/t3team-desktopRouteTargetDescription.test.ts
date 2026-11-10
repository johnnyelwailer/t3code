import { describe, expect, it } from "@effect/vitest";
import { Tool } from "effect/ai";

import { T3TeamDesktopRouteRequestTool } from "./t3team-desktopRouteTools.ts";

describe("request_desktop_route target", () => {
  it("tells the agent to copy the host verbatim from the repo's config", () => {
    const schema = Tool.getJsonSchema(T3TeamDesktopRouteRequestTool) as {
      readonly properties: { readonly target: { readonly description: string } };
    };
    const { description } = schema.properties.target;
    expect(description).toContain("verbatim");
    expect(description).toContain(".npmrc, NuGet.config, package.json");
    expect(description).toContain("never retype it");
  });
});
