import type { ToolAuthState } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ToolAuthCard } from "./t3team-ToolAuthCard";
import { TOOL_AUTH_TOOLS } from "./t3team-toolAuthTools";

const CLAUDE_META = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "claude")!;
const CODEX_META = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "codex")!;

const noop = () => {};

function renderCard(state: ToolAuthState | undefined, meta = CLAUDE_META) {
  return renderToStaticMarkup(
    <ToolAuthCard meta={meta} state={state} onConnect={noop} onSubmitCode={noop} onCancel={noop} />,
  );
}

describe("ToolAuthCard", () => {
  it("not connected (idle, or no state yet): shows the description and a Connect button", () => {
    const markup = renderCard(undefined);
    expect(markup).toContain(CLAUDE_META.description);
    expect(markup).toContain("Connect");
    expect(markup).not.toContain("<input");
  });

  it("idle with onInstall: the single action installs AND signs in", () => {
    const markup = renderToStaticMarkup(
      <ToolAuthCard
        meta={CODEX_META}
        state={undefined}
        onConnect={noop}
        onInstall={noop}
        onSubmitCode={noop}
        onCancel={noop}
      />,
    );
    expect(markup).toContain("Install and connect");
    expect(markup).toContain("Installing it also signs you in");
    // The plain "Connect" wording belongs to the already-installed case only.
    expect(markup).not.toContain(CODEX_META.description);
  });

  it("installing: shows progress from the installer's own output and says sign-in follows automatically", () => {
    const markup = renderCard({
      tool: "codex",
      phase: "installing",
      installLog: "npm warn deprecated foo\nadded 42 packages in 3s\n",
    }, CODEX_META);
    expect(markup).toContain(`Installing ${CODEX_META.label}`);
    // The tail line, so a long install doesn't look like a hang.
    expect(markup).toContain("added 42 packages in 3s");
    expect(markup).toContain("Signing in starts automatically");
    expect(markup).not.toContain("<input");
  });

  it("starting: shows a spinner and a starting message, no actionable button yet", () => {
    const markup = renderCard({ tool: "claude", phase: "starting" });
    expect(markup).toContain(`Starting ${CLAUDE_META.label}`);
    expect(markup).not.toContain("<input");
  });

  it("awaiting-open (Claude): a prominent link to the sign-in URL, opened in a new tab, and no input field", () => {
    const markup = renderCard({
      tool: "claude",
      phase: "awaiting-open",
      url: "https://claude.ai/oauth/authorize?foo=bar",
    });
    expect(markup).toContain('href="https://claude.ai/oauth/authorize?foo=bar"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain("<input");
  });

  it("awaiting-open (Codex): additionally displays the device code in large, selectable, monospace text, with a copy button — still no input field", () => {
    const markup = renderCard(
      {
        tool: "codex",
        phase: "awaiting-open",
        url: "https://auth.openai.com/device",
        displayCode: "ABCD-1234",
      },
      CODEX_META,
    );
    expect(markup).toContain("ABCD-1234");
    expect(markup).toContain("select-all");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("Copy device code");
    expect(markup).not.toContain("<input");
  });

  it("awaiting-code (Claude only): exactly one input field and a Verify button", () => {
    const markup = renderCard({
      tool: "claude",
      phase: "awaiting-code",
      url: "https://claude.ai/oauth/authorize",
    });
    expect(markup.match(/<input/g)).toHaveLength(1);
    expect(markup).toContain("Verify");
  });

  it("awaiting-code: the sign-in link stays visible alongside the input when a URL is set — a user who never opened the page, or closed the tab, is not stranded", () => {
    const markup = renderCard({
      tool: "claude",
      phase: "awaiting-code",
      url: "https://claude.ai/oauth/authorize?foo=bar",
    });
    expect(markup).toContain('href="https://claude.ai/oauth/authorize?foo=bar"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    // Still exactly one input — the link is a secondary affordance, not a second field.
    expect(markup.match(/<input/g)).toHaveLength(1);
  });

  it("verifying: shows a spinner", () => {
    const markup = renderCard({ tool: "claude", phase: "verifying" });
    expect(markup).toContain("Verifying");
    expect(markup).not.toContain("<input");
  });

  it("connected: shows account and organization, expiry, a warning when near expiry, and a Reconnect action", () => {
    const soon = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const markup = renderCard({
      tool: "claude",
      phase: "connected",
      account: "jane@example.com",
      organization: "Acme Corp",
      expiresAt: soon,
      message: "Expires in 2 days — reconnect soon.",
    });
    expect(markup).toContain("Signed in as jane@example.com · Acme Corp");
    expect(markup).toContain("Expires");
    expect(markup).toContain("reconnect soon");
    expect(markup).toContain("Reconnect");
  });

  it("connected without a warning: no warning message rendered", () => {
    const markup = renderCard({ tool: "claude", phase: "connected", account: "jane@example.com" });
    expect(markup).toContain("Signed in as jane@example.com");
    expect(markup).not.toContain("reconnect soon");
  });

  it("connected with no account or organization (the real, verified CLI shape reports neither): degrades to a plain Connected, no dangling separator", () => {
    const markup = renderCard({ tool: "claude", phase: "connected" });
    expect(markup).toContain("Connected");
    expect(markup).not.toContain("Signed in as");
    expect(markup).not.toContain("·");
    // Must never present authMethod/apiProvider-shaped values as an account.
    expect(markup).not.toContain("claudeai");
    expect(markup).not.toContain("firstParty");
  });

  it("connected with only an organization (no account): still degrades cleanly, no dangling separator", () => {
    const markup = renderCard({ tool: "claude", phase: "connected", organization: "Acme Corp" });
    expect(markup).toContain("Acme Corp");
    expect(markup).not.toContain("Signed in as");
    expect(markup).not.toContain("· ·");
  });

  it("failed: shows the CLI's own message, not a generic error, plus Retry", () => {
    const markup = renderCard({
      tool: "claude",
      phase: "failed",
      message: "Authentication failed: invalid code",
    });
    expect(markup).toContain("Authentication failed: invalid code");
    expect(markup).toContain("Retry");
  });

  it("expired: shows an Expired badge, the credential message, and a Reconnect action", () => {
    const markup = renderCard({
      tool: "claude",
      phase: "expired",
      message: "Credential has expired.",
    });
    expect(markup).toContain("Expired");
    expect(markup).toContain("Credential has expired.");
    expect(markup).toContain("Reconnect");
  });
});
