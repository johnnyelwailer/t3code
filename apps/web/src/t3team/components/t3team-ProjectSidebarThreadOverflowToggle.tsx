import { SidebarMenuSubButton, SidebarMenuSubItem } from "~/t3team/components/ui/t3team-sidebar";

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
      <SidebarMenuSubButton
        size="sm"
        className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
        onClick={onToggle}
      >
        <span>{expanded ? "Show less" : "Show more"}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
