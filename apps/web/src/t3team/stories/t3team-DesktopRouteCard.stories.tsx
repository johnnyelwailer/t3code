import type { Meta, StoryObj } from "@storybook/react";
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

import { T3TeamDesktopRouteCard } from "~/components/chat/t3team-DesktopRouteCard";

/** The card the agent's `request_desktop_route` posts, built from a real question the way the app does. */

const OPTIONS = [
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_SESSION_LABEL,
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
].map((label) => ({ label }));

const cardFor = (proposal: { target: string; internal: boolean }, reason: string) => {
  const card = desktopRouteCardFrom({
    id: encodeDesktopRouteQuestionId(proposal),
    header: DESKTOP_ROUTE_QUESTION_HEADER,
    question: `${desktopRouteQuestionLine(proposal)}\n\nThe agent wrote the host and its reason. Why: ${reason}`,
    options: OPTIONS,
  });
  if (card === null) throw new Error("fixture is not a desktop-route card");
  return card;
};

const meta = {
  title: "Chat/DesktopRouteCard",
  component: T3TeamDesktopRouteCard,
  parameters: { layout: "padded" },
  args: { sessionLabel: "acme-api (#4242)", onAnswer: () => {} },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof T3TeamDesktopRouteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicHost: Story = {
  args: {
    card: cardFor(
      { target: "registry.npmjs.org", internal: false },
      "npm ci times out behind the session's proxy; it needs the public registry.",
    ),
  },
};

/** An internal address: warned, and "Always for this host" is not offered. */
export const InternalHost: Story = {
  args: {
    card: cardFor(
      { target: "npm.nexplore.ch", internal: true },
      "The internal package registry is only reachable from your network.",
    ),
  },
};

export const Answering: Story = { args: { ...PublicHost.args, disabled: true } };
