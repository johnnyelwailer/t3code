import { SidebarMenuSubItem } from "~/t3team/components/ui/t3team-sidebar";
import { T3SidebarSubRow } from "~/t3team/components/ui/t3team-sidebar-row";

type ProjectSidebarThreadOverflowToggleProps = {
  expanded: boolean;
  onToggle: () => void;
};

export function ProjectSidebarThreadOverflowToggle({
  expanded,
  onToggle,
}: ProjectSidebarThreadOverflowToggleProps) {
  return (
    <SidebarMenuSubItem className="w-full">
      <T3SidebarSubRow size="micro" tone="muted" onClick={onToggle}>
        <span>{expanded ? "Show less" : "Show more"}</span>
      </T3SidebarSubRow>
    </SidebarMenuSubItem>
  );
}
