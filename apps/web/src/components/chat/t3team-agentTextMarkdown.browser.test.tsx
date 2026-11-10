import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  ProviderDriverKind,
  ProviderInstanceId,
  desktopRouteCardFrom,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
  type ServerProvider,
} from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { ProviderStatusBanner } from "./ProviderStatusBanner";
import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";

// Agent and status text is Markdown everywhere it shows. This flags raw Markdown punctuation on
// each surface that renders it; add a case here for every new agent-text surface.
const RAW_MARKDOWN = /`[^`]+`|\*\*[^*]+\*\*/;

function expectRendered(element: Element) {
  expect(element.textContent ?? "").not.toMatch(RAW_MARKDOWN);
  expect(element.querySelector("code")).not.toBeNull();
}

it("renders the provider status message as Markdown", async () => {
  const status: ServerProvider = {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Claude",
    enabled: true,
    installed: false,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-11-10T16:00:00.000Z",
    message: "Claude Agent CLI (`claude`) was not found on PATH.",
    models: [],
    slashCommands: [],
    skills: [],
  };
  await using screen = await render(<ProviderStatusBanner status={status} onDismiss={() => {}} />);
  expectRendered(screen.container);
});

it("renders the desktop route card's reason as Markdown", async () => {
  const proposal = { target: "npm.nexplore.ch", internal: true };
  const card = desktopRouteCardFrom({
    id: encodeDesktopRouteQuestionId(proposal),
    header: DESKTOP_ROUTE_QUESTION_HEADER,
    question: `${desktopRouteQuestionLine(proposal)}\n\nWhy: \`npm ci\` and \`dotnet restore\` need **this** host.`,
    options: [
      DESKTOP_ROUTE_ONCE_LABEL,
      DESKTOP_ROUTE_SESSION_LABEL,
      DESKTOP_ROUTE_ALWAYS_LABEL,
      DESKTOP_ROUTE_DECLINE_LABEL,
    ].map((label) => ({ label })),
  });
  if (card === null) throw new Error("not a route card");
  await using screen = await render(
    <T3TeamDesktopRouteCard card={card} sessionLabel="acme-api" onAnswer={() => {}} />,
  );
  const reason = screen.container.querySelector("[data-desktop-route-reason]");
  if (reason === null) throw new Error("no reason field");
  expectRendered(reason);
});
