import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ModelPickerProviderConnectPanel } from "./t3team-ModelPickerProviderConnectPanel";

function provider(input: {
  driverKind: ProviderDriverKind;
  instanceId: string;
  displayName: string;
  installed?: boolean;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.driverKind,
    displayName: input.displayName,
    enabled: true,
    installed: input.installed ?? true,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

describe("ModelPickerProviderConnectPanel", () => {
  it("needsAuth: renders the ToolAuthCard for the mapped tool (idle, since no session exists yet)", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        driverKind: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        displayName: "Claude Code",
      }),
    ]);

    const markup = renderToStaticMarkup(
      <ModelPickerProviderConnectPanel entry={entry!} tool="claude" readiness="needsAuth" />,
    );
    expect(markup).toContain("Claude Code");
    expect(markup).toContain("Connect");
    // The auth card, not the install card.
    expect(markup).not.toContain("isn't installed");
  });

  it("needsInstall: offers one action that installs AND signs in, with no fabricated install command", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        driverKind: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        displayName: "Codex",
        installed: false,
      }),
    ]);

    const markup = renderToStaticMarkup(
      <ModelPickerProviderConnectPanel entry={entry!} tool="codex" readiness="needsInstall" />,
    );
    expect(markup).toContain("Codex");
    // One click does both — not an install that dead-ends on "now go connect".
    expect(markup).toContain("Install and connect");
    expect(markup).toContain("Installing it also signs you in");
    // The old dead end must not come back.
    expect(markup).not.toContain("reload this picker");
    // The install command itself stays server-side: the package names live in
    // the driver metadata and are never sent over the wire, so the client must
    // not print one (it would drift the moment a package name changed).
    expect(markup).not.toContain("npm install");
    expect(markup).not.toContain("brew install");
    expect(markup).not.toContain("@anthropic-ai/claude-code");
    expect(markup).not.toContain("@openai/codex");
    expect(markup).not.toContain("<input");
  });
});
