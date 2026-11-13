import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  StartFooter,
  WELCOME_SECTIONS_GRID_CLASS,
  WelcomePageShell,
  WelcomeSection,
  WelcomeSectionsGrid,
} from "./t3team-welcomeLayout";
import {
  welcomeTitleAlign,
  welcomeTitleBarHeaderClass,
  welcomeTitleTextClass,
} from "./t3team-welcomeTitleBar";

const footer = (
  <StartFooter agentReady onStart={() => undefined} onStartWithoutAgent={() => undefined} />
);

function page(platform: string) {
  return renderToStaticMarkup(
    <WelcomePageShell title="Set up Nexi Work" footer={footer} platform={platform}>
      <WelcomeSectionsGrid>
        <WelcomeSection title="Agents">
          <div>agents</div>
        </WelcomeSection>
        <WelcomeSection title="Jira">
          <div>jira</div>
        </WelcomeSection>
        <WelcomeSection title="GitHub">
          <div>github</div>
        </WelcomeSection>
        <WelcomeSection title="Cloud">
          <div>cloud</div>
        </WelcomeSection>
      </WelcomeSectionsGrid>
    </WelcomePageShell>,
  );
}

describe("setup window layout", () => {
  it("uses a container-query grid: one column by default, two when the page is wide", () => {
    expect(WELCOME_SECTIONS_GRID_CLASS).toContain("grid-cols-1");
    expect(WELCOME_SECTIONS_GRID_CLASS).toContain("@3xl/welcome-page:grid-cols-2");
    const html = page("Win32");
    expect(html).toContain("@container/welcome-page");
    expect(html).toContain(WELCOME_SECTIONS_GRID_CLASS);
    expect(html).toContain("Agents");
    expect(html).toContain("Jira");
    expect(html).toContain("GitHub");
    expect(html).toContain("Cloud");
  });

  it("keeps the Start footer outside the scroll region so it is always reachable", () => {
    const html = page("Win32");
    const footerAt = html.indexOf('data-welcome-footer=""');
    const scrollAt = html.indexOf('data-welcome-scroll=""');
    expect(scrollAt).toBeGreaterThan(-1);
    expect(footerAt).toBeGreaterThan(scrollAt);
    expect(html).toContain(">Start</button>");
    expect(html).toContain("overflow-y-auto");
    // The Start button lives in the shrink-0 footer, after the scroll region closes.
    const scrollChunk = html.slice(scrollAt, footerAt);
    expect(scrollChunk).not.toContain(">Start</button>");
    expect(html.slice(footerAt)).toContain(">Start</button>");
  });

  it("left-aligns the title on Windows and Linux, matching the main app title bar", () => {
    expect(welcomeTitleAlign("Win32")).toBe("start");
    expect(welcomeTitleAlign("Linux x86_64")).toBe("start");
    expect(welcomeTitleBarHeaderClass("start")).toContain("justify-start");
    expect(welcomeTitleTextClass("start")).not.toContain("absolute");
    const html = page("Win32");
    expect(html).toContain('data-welcome-title-align="start"');
    expect(html).toContain("justify-start");
    expect(html).toContain("Set up Nexi Work");
    expect(html).not.toContain("absolute inset-0");
  });

  it("centers the title on macOS so it sits with the traffic lights", () => {
    expect(welcomeTitleAlign("MacIntel")).toBe("center");
    expect(welcomeTitleBarHeaderClass("center")).toContain("justify-center");
    expect(welcomeTitleTextClass("center")).toContain("absolute inset-0");
    const html = page("MacIntel");
    expect(html).toContain('data-welcome-title-align="center"');
    expect(html).toContain("justify-center");
    expect(html).toContain("absolute inset-0");
    expect(html).toContain("Set up Nexi Work");
  });
});
