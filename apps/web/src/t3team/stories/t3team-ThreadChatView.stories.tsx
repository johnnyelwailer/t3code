import type { Meta, StoryObj } from "@storybook/react";
import { ThreadChatView } from "~/t3team/chat/t3team-ThreadChatView";

const meta = {
  title: "Archived/Chat/ThreadChatView",
  component: ThreadChatView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ThreadChatView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    threadId: "thread-1",
    projectId: "proj-einb",
    projectTitle: "EinB Desktop",
    title: "Signature pad iOS fix",
    onBack: () => console.log("back"),
  },
};
