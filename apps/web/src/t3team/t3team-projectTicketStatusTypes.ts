import type { ProjectTicket } from "~/t3team/t3team-types";

export type ProjectTicketStatusCategory = "active" | "review" | "done";
export type ProjectTicketKanbanColumnId = string;
export type ProjectTicketKanbanColumn = {
  id: ProjectTicketKanbanColumnId;
  title: string;
  items: ProjectTicket[];
};
export type ProjectTicketKanbanColumns = readonly ProjectTicketKanbanColumn[];
export type ProjectTicketKanbanBoardColumn = {
  readonly name: string;
  readonly statuses: ReadonlyArray<{
    readonly name: string;
  }>;
};
