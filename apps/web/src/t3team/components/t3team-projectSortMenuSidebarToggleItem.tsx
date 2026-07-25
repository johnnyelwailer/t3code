import { MenuCheckboxItem } from "~/t3team/components/ui/t3team-menu";

export function SidebarToggleItem(input: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean | undefined;
}) {
  const { label, description, checked, onCheckedChange, disabled = false } = input;

  return (
    <MenuCheckboxItem
      checked={checked}
      onCheckedChange={(nextChecked) => onCheckedChange(Boolean(nextChecked))}
      disabled={disabled}
      variant="switch"
      className="min-h-11 py-1.5"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] leading-4 text-muted-foreground/80">{description}</span>
      </div>
    </MenuCheckboxItem>
  );
}
