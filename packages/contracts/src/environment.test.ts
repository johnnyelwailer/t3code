import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

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

const descriptor = {
  environmentId: "environment-1",
  label: "Local",
  platform: { os: "darwin", arch: "arm64" },
  serverVersion: "0.0.32",
  capabilities: { repositoryIdentity: true },
} as const;

describe("ExecutionEnvironmentDescriptor", () => {
  it("treats a missing pull-request capability as unsupported under version skew", () => {
    expect(decodeDescriptor(descriptor).capabilities.pullRequests).toBeUndefined();
  });

  it("preserves an advertised pull-request capability", () => {
    expect(
      decodeDescriptor({
        ...descriptor,
        capabilities: { ...descriptor.capabilities, pullRequests: true },
      }).capabilities.pullRequests,
    ).toBe(true);
  });

  it("treats a missing attachment upload capability as unsupported", () => {
    expect(decodeDescriptor(descriptor).capabilities.attachmentUploads).toBeUndefined();
  });

  it("preserves an advertised attachment upload capability", () => {
    expect(
      decodeDescriptor({
        ...descriptor,
        capabilities: { ...descriptor.capabilities, attachmentUploads: true },
      }).capabilities.attachmentUploads,
    ).toBe(true);
  });

  it("preserves the server's generic attachment upload limit", () => {
    expect(
      decodeDescriptor({
        ...descriptor,
        capabilities: {
          ...descriptor.capabilities,
          fileAttachments: { maxUploadBytes: 50 * 1024 * 1024 },
        },
      }).capabilities.fileAttachments,
    ).toEqual({ maxUploadBytes: 50 * 1024 * 1024 });
  });
});

describe("execution environment machine version skew", () => {
  it("preserves a known machine kind alongside fork appearance metadata", () => {
    const decoded = decodeDescriptor({
      ...descriptor,
      platform: { ...descriptor.platform, machine: "mac-mini" },
      appearance: { themeId: "nexplore", name: "Nexplore", colors: { light: {}, dark: {} } },
      capabilities: { ...descriptor.capabilities, environmentIcon: true, usageLimitSources: true },
    });
    expect(decoded.platform.machine).toBe("mac-mini");
    expect(decoded.appearance?.themeId).toBe("nexplore");
    expect(decoded.capabilities.environmentIcon).toBe(true);
    expect(decoded.capabilities.usageLimitSources).toBe(true);
  });

  it("ignores an unknown future machine kind without rejecting the descriptor", () => {
    const decoded = decodeDescriptor({
      ...descriptor,
      platform: { ...descriptor.platform, machine: "future-workstation" },
    });
    expect(decoded.platform.machine).toBeUndefined();
    expect(decoded.environmentId).toBe(descriptor.environmentId);
  });

  it("accepts older servers that omit the machine kind", () => {
    expect(decodeDescriptor(descriptor).platform.machine).toBeUndefined();
  });
});
