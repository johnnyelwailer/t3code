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
      className="min-h-11"
    >
      {/* The item's own py-1 plus this py-0.5 gives the two-line label its 6px inset. */}
      <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-3xs leading-4 text-muted-foreground/80">{description}</span>
      </div>
    </MenuCheckboxItem>
  );
}
