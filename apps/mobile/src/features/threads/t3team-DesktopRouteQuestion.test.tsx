import { desktopRouteCardFrom } from "@t3tools/contracts";
import {
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
  type EnvironmentId,
  type RuntimeRequestId,
} from "@t3tools/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/Button", () => ({
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../../state/presentation", () => ({
  useEnvironmentPresentation: () => ({
    presentation: {
      entry: {
        target: { _tag: "BrokerConnectionTarget", label: "acme-api", sessionId: "4242" },
      },
    },
  }),
}));

import { T3TeamDesktopRouteQuestion } from "./t3team-DesktopRouteQuestion";

const proposal = { target: "registry.npmjs.org", internal: false };
const questionId = encodeDesktopRouteQuestionId(proposal);
const question = {
  id: questionId,
  header: DESKTOP_ROUTE_QUESTION_HEADER,
  question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: x.`,
  options: [{ label: DESKTOP_ROUTE_ONCE_LABEL, description: "x" }],
  multiSelect: false,
};
const card = desktopRouteCardFrom(question);
if (card === null) throw new Error("fixture");

const mount = (submitResult: unknown) => {
  const onSelectOption = vi.fn();
  const onSubmit = vi.fn(async () => submitResult);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (answers: Record<string, string> | null) =>
    act(() =>
      root.render(
        <T3TeamDesktopRouteQuestion
          card={card}
          question={question as never}
          requestId={"req" as RuntimeRequestId}
          environmentId={"env" as EnvironmentId}
          disabled={false}
          answers={answers}
          onSelectOption={onSelectOption}
          onSubmit={onSubmit}
        />,
      ),
    );
  render(null);
  const once = () =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === "Approve once");
  return { render, once, onSelectOption, onSubmit, container };
};

describe("T3TeamDesktopRouteQuestion", () => {
  it("names the session like the web card and submits once the draft holds the tapped answer", async () => {
    const view = mount({ _tag: "Success" });
    expect(view.container.textContent).toContain("acme-api (#4242)");
    act(() => view.once()?.click());
    expect(view.onSelectOption).toHaveBeenCalledWith("req", question, DESKTOP_ROUTE_ONCE_LABEL);
    expect(view.onSubmit).not.toHaveBeenCalled();
    await act(async () => view.render({ [questionId]: DESKTOP_ROUTE_ONCE_LABEL }));
    await act(async () => view.render({ [questionId]: DESKTOP_ROUTE_ONCE_LABEL }));
    expect(view.onSubmit).toHaveBeenCalledOnce();
  });

  it("re-enables the card when the submit did not go through", async () => {
    const view = mount({ _tag: "Failure" });
    act(() => view.once()?.click());
    expect(view.once()?.disabled).toBe(true);
    await act(async () => view.render({ [questionId]: DESKTOP_ROUTE_ONCE_LABEL }));
    expect(view.onSubmit).toHaveBeenCalledOnce();
    expect(view.once()?.disabled).toBe(false);
  });
});
