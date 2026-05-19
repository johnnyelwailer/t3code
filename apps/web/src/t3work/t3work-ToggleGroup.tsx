export function ToggleGroup({
  value,
  onChange,
  options,
  wrap,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  wrap?: boolean;
}) {
  return (
    <div
      className={`inline-flex rounded-md border border-border/80 bg-background p-0.5 ${
        wrap ? "flex-wrap" : ""
      }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            value === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
