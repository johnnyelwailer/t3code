import type { Meta, StoryObj } from "@storybook/react";
import { ThreadId } from "@t3tools/contracts";
import { useState } from "react";

import type { RightPanelSurface } from "~/rightPanelStore";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { viewSurfaceId, type T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

import {
  createViewTabsBackend,
  storyProject,
  TICKET_4711,
  TICKET_4788,
  type StoryBackendMode,
  type StoryTicket,
} from "./t3team-viewTabsStoryFixtures";
import { NewChatHereScenario } from "./t3team-viewTabsNewChatHere";
import { ViewTabsStoryPanel } from "./t3team-viewTabsStoryPanel";

type Layout = "many-tabs" | "work-item" | "my-work" | "unknown-ticket";

function viewSurface(target: T3TeamViewTarget): RightPanelSurface {
  return { id: viewSurfaceId(target), kind: "view", target };
}

function sideChat(id: string): RightPanelSurface {
  return { id: `side-chat:${id}`, kind: "side-chat", threadId: ThreadId.make(id) };
}

function workItem(projectId: string, ticket: StoryTicket): T3TeamViewTarget {
  return {
    kind: "work-item",
    projectId,
    ticketId: ticket.id,
    displayId: ticket.displayId,
    title: ticket.title,
  };
}

function layoutSurfaces(layout: Layout, projectId: string) {
  const myWork = viewSurface({ kind: "my-work", projectId });
  const first = viewSurface(workItem(projectId, TICKET_4711));
  if (layout === "my-work") return { surfaces: [myWork], active: myWork.id };
  if (layout === "unknown-ticket") {
    const missing = viewSurface({
      kind: "work-item",
      projectId,
      ticketId: "99999",
      displayId: "NX-9999",
    });
    return { surfaces: [myWork, missing], active: missing.id };
  }
  const surfaces = [
    sideChat("story-side-a"),
    sideChat("story-side-b"),
    myWork,
    first,
    viewSurface(workItem(projectId, TICKET_4788)),
  ];
  return { surfaces, active: layout === "work-item" ? first.id : myWork.id };
}

function ViewTabsScenario(props: {
  readonly slug: string;
  readonly mode: StoryBackendMode;
  readonly layout: Layout;
  readonly width: number;
  readonly projectKnown?: boolean;
  readonly caption: string;
}) {
  const [scenario] = useState(() => {
    const project = storyProject(props.slug);
    return {
      project,
      backend: createViewTabsBackend(project, props.mode),
      ...layoutSurfaces(props.layout, project.id),
    };
  });
  return (
    <ViewTabsStoryPanel
      backend={scenario.backend}
      projects={props.projectKnown === false ? [] : [scenario.project]}
      projectId={scenario.project.id}
      surfaces={scenario.surfaces}
      activeSurfaceId={scenario.active}
      width={props.width}
      caption={props.caption}
    />
  );
}

const meta = {
  title: "T3Team/Right Panel/View Tabs",
  component: ViewTabsScenario,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ViewTabsScenario>;

export default meta;

type Story = StoryObj<typeof meta>;

const dark = (story: Story): Story => ({ ...story, globals: { theme: "dark" } });

export const ManyTabs: Story = {
  args: {
    slug: "many",
    mode: "ready",
    layout: "many-tabs",
    width: 560,
    caption: "Two side chats, My Work and two work items. A digest row opens its ticket as a tab.",
  },
};
export const ManyTabsDark = dark(ManyTabs);

export const WorkItemActive: Story = {
  args: {
    slug: "item",
    mode: "ready",
    layout: "work-item",
    width: 560,
    caption: "The work item's detail column, the same one My Work shows beside the digest.",
  },
};
export const WorkItemActiveDark = dark(WorkItemActive);

export const NarrowOverflow: Story = {
  args: {
    slug: "narrow",
    mode: "ready",
    layout: "work-item",
    width: 320,
    caption:
      "320px: the tab strip scrolls, long German titles truncate, the tooltip has them whole.",
  },
};
export const NarrowOverflowDark = dark(NarrowOverflow);

export const Loading: Story = {
  args: {
    slug: "loading",
    mode: "loading",
    layout: "my-work",
    width: 480,
    caption: "The digest has not answered yet.",
  },
};
export const LoadingDark = dark(Loading);

export const DigestError: Story = {
  args: {
    slug: "error",
    mode: "error",
    layout: "my-work",
    width: 480,
    caption: "The digest fetch failed: the digest's own retrying state.",
  },
};
export const DigestErrorDark = dark(DigestError);

export const Empty: Story = {
  args: {
    slug: "empty",
    mode: "empty",
    layout: "my-work",
    width: 480,
    caption: "Nothing is assigned: the digest's own empty state.",
  },
};
export const EmptyDark = dark(Empty);

export const UnknownTicket: Story = {
  args: {
    slug: "unknown",
    mode: "ready",
    layout: "unknown-ticket",
    width: 480,
    caption: "A ticket that no longer exists: the work item's own error state.",
  },
};
export const UnknownTicketDark = dark(UnknownTicket);

export const UnknownProject: Story = {
  args: {
    slug: "noproject",
    mode: "ready",
    layout: "my-work",
    width: 480,
    projectKnown: false,
    caption: "A tab whose project is not bound to a work source on this machine.",
  },
};
export const UnknownProjectDark = dark(UnknownProject);

export const NewChatHere: StoryObj<typeof NewChatHereScenario> = {
  render: () => <NewChatHereScenario />,
};
export const NewChatHereDark: StoryObj<typeof NewChatHereScenario> = {
  ...NewChatHere,
  globals: { theme: "dark" },
};
