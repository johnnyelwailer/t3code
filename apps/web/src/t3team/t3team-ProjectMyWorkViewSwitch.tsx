import { Columns3, ListTree, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

export type ProjectMyWorkLens = "digest" | "hierarchy" | "board";

const LENSES: ReadonlyArray<{
  value: ProjectMyWorkLens;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { value: "digest", label: "Digest view", Icon: Sparkles },
  { value: "hierarchy", label: "Hierarchy view", Icon: ListTree },
  { value: "board", label: "Board view", Icon: Columns3 },
];

export function ProjectMyWorkViewSwitch({
  lens,
  onLensChange,
}: {
  lens: ProjectMyWorkLens;
  onLensChange: (value: ProjectMyWorkLens) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-border/70 bg-background/90"
      role="group"
      aria-label="My Work view switch"
    >
      {LENSES.map(({ value, label, Icon }, index) => {
        const active = lens === value;
        const corner =
          index === 0 ? "rounded-l-md" : index === LENSES.length - 1 ? "rounded-r-md" : "";
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onLensChange(value)}
            className={`inline-flex size-8 items-center justify-center transition-colors ${corner} ${
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
