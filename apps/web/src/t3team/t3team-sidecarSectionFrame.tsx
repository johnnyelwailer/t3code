import { Component, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Menu } from "~/t3team/components/ui/t3team-menu";
import {
  T3TeamSidecarMenuContent,
  T3TeamSidecarMenuKebabTrigger,
} from "~/t3team/t3team-sidecarSectionMenu";
import type { T3TeamSidecarMenuEntry } from "~/t3team/t3team-sidecarSectionMenuActions";

export class T3TeamSidecarSectionErrorBoundary extends Component<
  { readonly children: ReactNode; readonly fallback: ReactNode },
  { readonly hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export function T3TeamSidecarSectionFrame({
  sectionId,
  title,
  collapsed,
  onToggleCollapsed,
  menuEntries,
  children,
}: {
  readonly sectionId: string;
  readonly title: string;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly menuEntries: ReadonlyArray<T3TeamSidecarMenuEntry>;
  readonly children: ReactNode;
}) {
  const triggerId = useId();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="space-y-3" data-sidecar-section-id={sectionId}>
      <Menu open={menuOpen} onOpenChange={setMenuOpen} triggerId={triggerId}>
        <div
          className="group/sidecar-header flex items-center justify-between gap-3"
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {title}
          </h4>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
              title={collapsed ? "Expand section" : "Collapse section"}
              onClick={onToggleCollapsed}
            >
              {collapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
            <T3TeamSidecarMenuKebabTrigger
              triggerId={triggerId}
              label={`${title} actions`}
              className="opacity-0 transition-opacity group-hover/sidecar-header:opacity-100 group-focus-within/sidecar-header:opacity-100"
            />
          </div>
        </div>
        <T3TeamSidecarMenuContent entries={menuEntries} />
      </Menu>

      {collapsed ? null : children}
    </section>
  );
}
