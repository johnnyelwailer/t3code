import { Card, CardContent } from "~/t3team/components/ui/t3team-card";
import { CheckCircle2, Circle, HelpCircle } from "lucide-react";

interface AcceptanceCriterion {
  id: string;
  text: string;
  status: "met" | "unmet" | "unknown";
  notes?: string;
}

interface TicketAcceptanceCriteriaProps {
  criteria: AcceptanceCriterion[];
}

export function TicketAcceptanceCriteria({ criteria }: TicketAcceptanceCriteriaProps) {
  if (criteria.length === 0) return null;

  const met = criteria.filter((c) => c.status === "met").length;
  const total = criteria.length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Acceptance Criteria</h3>
          <span className="text-xs text-muted-foreground">
            {met}/{total} met
          </span>
        </div>
        <div className="space-y-2">
          {criteria.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              {c.status === "met" ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
              ) : c.status === "unmet" ? (
                <Circle className="size-4 shrink-0 text-muted-foreground mt-0.5" />
              ) : (
                <HelpCircle className="size-4 shrink-0 text-amber-500 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-sm">{c.text}</span>
                {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
