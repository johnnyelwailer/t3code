import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProjectId } from "@t3tools/contracts";
import {
  makeThreadRowProps,
  makeThreadShell,
  ThreadRowHarness,
} from "~/components/sidebar/t3team-SidebarThreadRow.fixture";
import { moveThreadContextDrag } from "~/components/chat/threadContextDrag";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";

/**
 * Sidebar thread rows as drop targets (UI_SIDEBAR_THREAD_DROP). Every frame mounts the real
 * `SortableThreadRow`; the drags are driven through the production event paths, never styled by hand.
 */
const meta = {
  title: "T3Team/Sidebar/Thread Row Drop Target",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const WORK_ITEM_CAPABILITIES = buildAddToChatAgentContextCapabilities(
  {
    projectId: "project-1",
    projectTitle: "Alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    payload: {},
  },
  {
    tools: [{ id: "t3_work_item_get", label: "Read work item", arguments: { issueKey: "PROJ-9" } }],
  },
);

function WorkItemDragSource() {
  const drag = useT3TeamAgentContextDrag({
    capabilities: WORK_ITEM_CAPABILITIES,
    label: "PROJ-9 Prepare release checklist",
  });
  return (
    <div
      data-testid="work-item-source"
      className="mb-3 w-72 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
      {...drag}
    >
      PROJ-9 Prepare release checklist
    </div>
  );
}

function RowWithWorkItemSource() {
  return (
    <>
      <WorkItemDragSource />
      <ThreadRowHarness row={makeThreadRowProps()} />
    </>
  );
}

export const Idle: Story = {
  render: () => <ThreadRowHarness row={makeThreadRowProps()} />,
};

/** A work item dragged over the row: `dragenter`/`dragover` carry the source's real `DataTransfer`. */
export const WorkItemDragOver: Story = {
  render: () => <RowWithWorkItemSource />,
  play: ({ canvasElement }) => {
    const source = canvasElement.querySelector<HTMLElement>('[data-testid="work-item-source"]');
    const row = canvasElement.querySelector<HTMLElement>('[role="treeitem"]');
    if (!source || !row) throw new Error("work item source or thread row did not render");
    const dataTransfer = new DataTransfer();
    const dragEvent = (type: string) =>
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
    source.dispatchEvent(dragEvent("dragstart"));
    row.dispatchEvent(dragEvent("dragenter"));
    row.dispatchEvent(dragEvent("dragover"));
  },
};

/** The same drag over a thread of another project: not a droppable target, so no overlay. */
export const WorkItemDragOverOtherProject: Story = {
  ...WorkItemDragOver,
  render: () => (
    <>
      <WorkItemDragSource />
      <ThreadRowHarness
        row={makeThreadRowProps({
          thread: makeThreadShell({ projectId: ProjectId.make("project-2") }),
        })}
      />
    </>
  ),
};

/** A thread dragged from the sidebar: the helper marks the row under the pointer, as the app does. */
export const ThreadContextDragOver: Story = {
  render: () => <ThreadRowHarness row={makeThreadRowProps()} />,
  play: ({ canvasElement }) => {
    const row = canvasElement.querySelector<HTMLElement>('[role="treeitem"]');
    if (!row) throw new Error("thread row did not render");
    const bounds = row.getBoundingClientRect();
    moveThreadContextDrag(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      { title: "Fix flaky retry test", count: 1 },
    );
  },
};
