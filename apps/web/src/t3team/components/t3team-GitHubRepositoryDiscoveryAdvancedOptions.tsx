import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";

// Extracted from t3team-GitHubRepositoryDiscoverySection.tsx: the authenticated and
// unauthenticated branches there both render this same collapsible trigger/chevron shell
// around different manual-search content — sharing it keeps both branches to their own
// content instead of duplicating the toggle chrome.
export function GitHubRepositoryDiscoveryAdvancedOptions({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between px-1 py-1 text-left text-xs text-muted-foreground hover:text-foreground">
          <span>Search a different host</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
