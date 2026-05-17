export function buildTicketContextPrompt(input: {
  projectTitle: string;
  displayId: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
  ticketUrl?: string;
  description: string;
}): string {
  const lines = [
    "You are helping with a Jira ticket. Use this context in your responses.",
    `Project: ${input.projectTitle}`,
    `Ticket: ${input.displayId}`,
    `Title: ${input.title}`,
    `Status: ${input.status}`,
    input.priority ? `Priority: ${input.priority}` : "",
    input.assignee ? `Assignee: ${input.assignee}` : "",
    input.ticketUrl ? `URL: ${input.ticketUrl}` : "",
    "",
    "Description:",
    input.description || "(No description available)",
    "",
    "Please summarize this ticket, identify risks, and propose a concrete implementation plan.",
  ];

  return lines.filter((line) => line.length > 0).join("\n");
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
