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
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

type ButtonProps = { label: string; disabled?: boolean; onPress: () => void };

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label, disabled, onPress }: ButtonProps) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));

import { T3TeamDesktopRouteCard } from "./t3team-DesktopRouteCard";

const card = (proposal: { target: string; internal: boolean }) => {
  const built = desktopRouteCardFrom({
    id: encodeDesktopRouteQuestionId(proposal),
    header: DESKTOP_ROUTE_QUESTION_HEADER,
    question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: npm ci times out.`,
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

const mount = (c: ReturnType<typeof card>, disabled = false, onAnswer = vi.fn()) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <T3TeamDesktopRouteCard
        card={c}
        sessionLabel="acme-api (#4242)"
        disabled={disabled}
        onAnswer={onAnswer}
      />,
    ),
  );
  const buttons = () => [...container.querySelectorAll("button")];
  return { container, buttons, onAnswer, unmount: () => act(() => root.unmount()) };
};

describe("mobile T3TeamDesktopRouteCard", () => {
  it("shows Always only when the card offers it, and each button answers with its label", () => {
    const view = mount(card({ target: "registry.npmjs.org", internal: false }));
    expect(view.buttons().map((b) => b.textContent)).toEqual([
      "Approve once",
      "Approve for this session",
      "Deny",
      "Always for this host",
    ]);
    act(() => view.buttons()[0]?.click());
    act(() => view.buttons()[3]?.click());
    expect(view.onAnswer.mock.calls.map((c) => c[0])).toEqual([
      DESKTOP_ROUTE_ONCE_LABEL,
      DESKTOP_ROUTE_ALWAYS_LABEL,
    ]);
    view.unmount();
  });

  it("warns for an internal host and offers no Always, even if the agent said public", () => {
    const view = mount(card({ target: "10.4.4.4", internal: false }));
    expect(view.container.textContent).toContain("Internal address");
    expect(view.container.textContent).toContain("acme-api (#4242)");
    expect(view.buttons().map((b) => b.textContent)).not.toContain("Always for this host");
    view.unmount();
  });

  it("disables every action while an answer is going out", () => {
    const view = mount(card({ target: "registry.npmjs.org", internal: false }), true);
    expect(view.buttons().every((b) => b.disabled)).toBe(true);
    view.unmount();
  });
});
