import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";

const decodeDescriptor = Schema.decodeUnknownSync(ExecutionEnvironmentDescriptor);

describe("execution environment appearance", () => {
  it("preserves pack theme metadata", () => {
    const decoded = decodeDescriptor({
      environmentId: "00000000-0000-4000-8000-000000000001",
      label: "Local",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "1.0.0",
      capabilities: { repositoryIdentity: true },
      appearance: {
        themeId: "nexplore",
        name: "Nexplore",
        labels: { appName: "Nexi" },
        colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
      },
    });
    expect(decoded.appearance?.labels?.appName).toBe("Nexi");
  });
});
