import { Component, useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RecipeSurface, SidecarComposition } from "@t3tools/project-recipes";
import {
  DEFAULT_SIDECAR_COMPOSITION,
  getT3WorkProfile,
  listBundledSidecarSections,
} from "@t3tools/t3work-skill-packs";

import { useT3workSidecarComposition } from "~/t3work/hooks/t3work-useSidecarComposition";
import { getT3workSidecarSectionComponent } from "~/t3work/t3work-sidecarSectionRegistry";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";

type T3workSidecarCompositionProps = {
  readonly surface: RecipeSurface;
  readonly profileId?: string | undefined;
  readonly projectDefault?: SidecarComposition | undefined;
  readonly host: SidecarSectionHost;
  readonly resolveSectionProps?: ((sectionId: string) => unknown) | undefined;
  readonly emptyState?: ReactNode;
};

type SidecarSectionFrameProps = {
  readonly sectionId: string;
  readonly title: string;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly children: ReactNode;
};

type SidecarSectionErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
};

type SidecarSectionErrorBoundaryState = {
  readonly hasError: boolean;
};

class SidecarSectionErrorBoundary extends Component<
  SidecarSectionErrorBoundaryProps,
  SidecarSectionErrorBoundaryState
> {
  override state: SidecarSectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SidecarSectionErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function SidecarSectionFrame({
  sectionId,
  title,
  collapsed,
  onToggleCollapsed,
  children,
}: SidecarSectionFrameProps) {
  return (
    <section className="space-y-3" data-sidecar-section-id={sectionId}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {title}
        </h4>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
          title={collapsed ? "Expand section" : "Collapse section"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>

      {collapsed ? null : children}
    </section>
  );
}

export function T3workSidecarComposition({
  surface,
  profileId,
  projectDefault,
  host,
  resolveSectionProps,
  emptyState,
}: T3workSidecarCompositionProps) {
  const profileDefault = getT3WorkProfile(profileId).sidecarSections;
  const bundledSectionsById = useMemo(
    () => new Map(listBundledSidecarSections().map((section) => [section.id, section])),
    [],
  );
  const { composition, setCollapsed } = useT3workSidecarComposition({
    bundledDefault: DEFAULT_SIDECAR_COMPOSITION,
    profileDefault,
    projectDefault,
  });

  const visibleSections = composition.sections.flatMap((sectionState) => {
    const definition = bundledSectionsById.get(sectionState.sectionId);
    if (!definition || !definition.surfaces.includes(surface)) {
      return [];
    }

    return [{ definition, sectionState }];
  });

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {visibleSections.length === 0
        ? (emptyState ?? (
            <p className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground/70">
              No sidecar sections are available for this view.
            </p>
          ))
        : visibleSections.map(({ definition, sectionState }) => {
            const SectionComponent = getT3workSidecarSectionComponent(definition.component);
            const collapsed = sectionState.collapsed === true;

            return (
              <SidecarSectionFrame
                key={definition.id}
                sectionId={definition.id}
                title={definition.title}
                collapsed={collapsed}
                onToggleCollapsed={() => setCollapsed(definition.id, !collapsed)}
              >
                <SidecarSectionErrorBoundary
                  fallback={
                    <p className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground/70">
                      This section is unavailable right now.
                    </p>
                  }
                >
                  {SectionComponent ? (
                    <SectionComponent host={host} props={resolveSectionProps?.(definition.id)} />
                  ) : (
                    <p className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground/70">
                      This section is unavailable right now.
                    </p>
                  )}
                </SidecarSectionErrorBoundary>
              </SidecarSectionFrame>
            );
          })}
    </div>
  );
}
