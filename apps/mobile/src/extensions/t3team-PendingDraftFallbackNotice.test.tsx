import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { PendingDraftFallbackNotice } from "./t3team-PendingDraftFallbackNotice";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

const pending: PendingDraft = {
  project: { environmentId: "env", id: "p", title: "Cloud session" },
  statusLabel: "Starting",
  tone: "working",
  sendBlockedReason: "Waiting for the session.",
  Card: ({ draftKey }) => <b>card:{draftKey}</b>,
};
const stockText = "Connect to an environment to choose its first model.";

it("shows the pending draft's card instead of the dead stock line", () => {
  const html = renderToStaticMarkup(
    <PendingDraftFallbackNotice pendingDraft={pending} draftKey="d1" stockText={stockText} />,
  );
  expect(html).toContain("card:");
  expect(html).not.toContain(stockText);
});

it("keeps the stock line for a draft that is not pending", () => {
  const html = renderToStaticMarkup(
    <PendingDraftFallbackNotice pendingDraft={null} draftKey="d1" stockText={stockText} />,
  );
  expect(html).toContain(stockText);
});
