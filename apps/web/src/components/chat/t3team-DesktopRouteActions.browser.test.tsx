import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  desktopRouteCardFrom,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { T3TeamDesktopRouteActions } from "./t3team-DesktopRouteActions";

const proposal = { target: "registry.npmjs.org", internal: false };
const card = desktopRouteCardFrom({
  id: encodeDesktopRouteQuestionId(proposal),
  header: DESKTOP_ROUTE_QUESTION_HEADER,
  question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: npm ci times out.`,
  options: [
    DESKTOP_ROUTE_ONCE_LABEL,
    DESKTOP_ROUTE_SESSION_LABEL,
    DESKTOP_ROUTE_ALWAYS_LABEL,
    DESKTOP_ROUTE_DECLINE_LABEL,
  ].map((label) => ({ label })),
})!;

// router: false - presentational buttons and a menu, no links.
const mount = (onAnswer: (label: string) => void) =>
  render(<T3TeamDesktopRouteActions card={card} disabled={false} onAnswer={onAnswer} />, {
    router: false,
  });

it("answers once from Approve, and each menu item and Deny with its own scope", async () => {
  const onAnswer = vi.fn();
  await using _screen = await mount(onAnswer);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Deny" }).click();
  for (const item of ["Approve for this session", "Always for this host"]) {
    await page.getByRole("button", { name: "More ways to approve" }).click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  }
  expect(onAnswer.mock.calls.map(([label]) => label)).toEqual([
    DESKTOP_ROUTE_ONCE_LABEL,
    DESKTOP_ROUTE_DECLINE_LABEL,
    DESKTOP_ROUTE_SESSION_LABEL,
    DESKTOP_ROUTE_ALWAYS_LABEL,
  ]);
});

it("reaches every scope by keyboard alone", async () => {
  const onAnswer = vi.fn();
  await using _screen = await mount(onAnswer);
  await userEvent.tab();
  await expect.element(page.getByRole("button", { name: "Approve", exact: true })).toHaveFocus();
  await userEvent.tab();
  await expect.element(page.getByRole("button", { name: "More ways to approve" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(page.getByRole("menuitem", { name: "Approve for this session" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await vi.waitFor(() => expect(onAnswer).toHaveBeenCalledWith(DESKTOP_ROUTE_ALWAYS_LABEL));
});
