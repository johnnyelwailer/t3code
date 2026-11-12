import { desktopRouteCardFrom } from "@t3tools/contracts";
import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";

const card = (proposal: { target: string; internal: boolean }, reason = "npm ci times out.") => {
  const built = desktopRouteCardFrom({
    id: encodeDesktopRouteQuestionId(proposal),
    header: DESKTOP_ROUTE_QUESTION_HEADER,
    question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: ${reason}`,
    options: [
      DESKTOP_ROUTE_ONCE_LABEL,
      DESKTOP_ROUTE_SESSION_LABEL,
      DESKTOP_ROUTE_ALWAYS_LABEL,
      DESKTOP_ROUTE_DECLINE_LABEL,
    ].map((label) => ({ label })),
  });
  if (built === null) throw new Error("not a card");
  return built;
};
const render = (c: ReturnType<typeof card>, sessionLabel: string | null = "acme-api (#4242)") =>
  renderToStaticMarkup(
    <T3TeamDesktopRouteCard card={c} sessionLabel={sessionLabel} onAnswer={() => {}} />,
  );

describe("T3TeamDesktopRouteCard", () => {
  it("names the session and host, and offers Approve, a menu for wider scopes, and Deny", () => {
    const html = render(card({ target: "registry.npmjs.org", internal: false }));
    expect(html).toContain("acme-api (#4242)");
    expect(html).toContain("registry.npmjs.org");
    expect(html).toContain(">Approve<");
    expect(html).toContain('aria-label="More ways to approve"');
    expect(html).toContain(">Deny<");
    expect(html).not.toContain("Internal address");
  });

  it("offers no approval at all on a thread that already runs on this computer", () => {
    const html = render(card({ target: "prod.example.com", internal: false }), null);
    expect(html).toContain("Nothing to route");
    expect(html).toContain("already runs on your computer");
    expect(html).not.toContain("Cloud session");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain("More ways to approve");
    expect(html).toContain(">Dismiss<");
  });

  it("warns for an internal host", () => {
    const html = render(card({ target: "10.4.4.4", internal: false }));
    expect(html).toContain("Internal address");
  });

  it("never renders the agent's raw HTML", () => {
    const html = render(
      card({ target: "registry.npmjs.org", internal: false }, "<img src=x onerror=1>"),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("renders the agent's reason as Markdown, never raw backticks", () => {
    const html = render(
      card(
        { target: "npm.nexplore.ch", internal: false },
        "`npm ci` and `dotnet restore` need **this** host.",
      ),
    );
    expect(html).toContain("<code");
    expect(html).toContain("<strong>this</strong>");
    expect(html).not.toContain("`npm ci`");
    expect(html).not.toContain("**this**");
  });
});
