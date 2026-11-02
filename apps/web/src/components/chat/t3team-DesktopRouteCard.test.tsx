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
const render = (c: ReturnType<typeof card>) =>
  renderToStaticMarkup(
    <T3TeamDesktopRouteCard card={c} sessionLabel="acme-api (#4242)" onAnswer={() => {}} />,
  );

describe("T3TeamDesktopRouteCard", () => {
  it("names the session and host, and offers approve once, approve for the session, deny and always", () => {
    const html = render(card({ target: "registry.npmjs.org", internal: false }));
    expect(html).toContain("acme-api (#4242)");
    expect(html).toContain("registry.npmjs.org");
    for (const text of [
      "Approve once",
      "Approve for this session",
      "Deny",
      "Always for this host",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Internal address");
  });

  it("warns for an internal host and drops Always, even when the agent did not flag it", () => {
    const html = render(card({ target: "10.4.4.4", internal: false }));
    expect(html).toContain("Internal address");
    expect(html).not.toContain("Always for this host");
  });

  it("shows the agent's words as text, never markup", () => {
    const html = render(
      card({ target: "registry.npmjs.org", internal: false }, "<img src=x onerror=1>"),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
