import { Card, CardContent } from "~/t3team/components/ui/t3team-card";
import { MessageSquare, GitCommit, User } from "lucide-react";

interface ActivityItem {
  id: string;
  kind: "comment" | "status" | "assignment" | "mention";
  author: string;
  text: string;
  timestamp: string;
}

interface TicketActivityFeedProps {
  activities: ActivityItem[];
}

function formatTimeAgo(dateString: string): string {
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

function ActivityIcon({ kind }: { kind: ActivityItem["kind"] }) {
  switch (kind) {
    case "comment":
      return <MessageSquare className="size-3.5 text-muted-foreground" />;
    case "status":
      return <GitCommit className="size-3.5 text-muted-foreground" />;
    default:
      return <User className="size-3.5 text-muted-foreground" />;
  }
}

export function TicketActivityFeed({ activities }: TicketActivityFeedProps) {
  if (activities.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">Activity</h3>
        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-2.5">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-card mt-0.5">
                <ActivityIcon kind={activity.kind} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium">{activity.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(activity.timestamp)}
                  </span>
                </div>
                <p className="text-sm mt-0.5">{activity.text}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
