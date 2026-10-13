import { providerInstanceInitials } from "@t3tools/client-runtime/state/provider-instance-display";
import { ProviderDriverKind } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

/** The Nexplore mark's viewBox — present in the markup only when the brand glyph renders. */
const NEXPLORE_MARK_VIEW_BOX = "0 4.093 17.232 17.232";

function renderIcon(driverKind: string, displayName: string): string {
  return renderToStaticMarkup(
    <ProviderInstanceIcon
      driverKind={ProviderDriverKind.make(driverKind)}
      displayName={displayName}
    />,
  );
}

describe("ProviderInstanceIcon for Nexplore AI", () => {
  it("renders the Nexplore brand mark when no iconDataUrl is passed, not the 'NA' monogram", () => {
    const markup = renderIcon("nexplore", "Nexplore AI");

    expect(markup).toContain(`viewBox="${NEXPLORE_MARK_VIEW_BOX}"`);
    expect(markup).toContain('fill="#f05a0a"');
    expect(providerInstanceInitials("Nexplore AI")).toBe("NA");
    expect(markup).not.toContain(">NA<");
  });

  it("still renders a glyph, not initials, for every built-in provider", () => {
    for (const driverKind of [
      "codex",
      "claudeAgent",
      "opencode",
      "cursor",
      "grok",
      "antigravity",
    ]) {
      const markup = renderIcon(driverKind, "Zed Provider");
      expect(markup).toContain("<svg");
      expect(markup).not.toContain(">ZP<");
    }
  });

  it("falls back to initials for a driver with no built-in glyph", () => {
    expect(renderIcon("unknownDriver", "Zed Provider")).toContain(">ZP<");
  });
});
