import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as Schema from "effect/Schema";
import { cn } from "~/lib/utils";
import { useMediaQuery } from "~/t3team/hooks/t3team-useMediaQuery";
import { setLocalStorageItem } from "~/t3team/hooks/t3team-useLocalStorage";
import { T3TeamMobilePanelLayout } from "~/t3team/t3team-MobilePanelLayout";
import {
  clampRightSidebarWidth,
  useElementFitsWidth,
  useStoredRightSidebarState,
  type ResizableRightSidebarDragState,
} from "~/t3team/t3team-ResizableRightSidebarLayoutShared";
import { ResizableRightSidebarAside } from "./t3team-ResizableRightSidebarAside";
import { useAsideReveal } from "./t3team-useAsideReveal";

type ResizableRightSidebarLayoutProps = {
  main: ReactNode;
  aside: ReactNode;
  storageKey: string;
  collapsedStorageKey?: string;
  /** Start collapsed until the user opens the aside; see `mobileAsideRequest` for the reveal. */
  defaultCollapsed?: boolean;
  className?: string;
  mainClassName?: string;
  asideClassName?: string;
  minAsideWidth?: number;
  defaultAsideWidth?: number;
  minMainWidth?: number;
  mobileDefaultPanel?: "main" | "aside";
  mobileMainLabel?: string;
  mobileAsideLabel?: string;
  /**
   * Changes whenever the caller opens something in the aside (a PR, a thread): the drawer rises,
   * and a collapsed desktop aside opens for it until it is closed again (null).
   */
  mobileAsideRequest?: object | null;
  /** The thread embedded in the aside, if any: a newly shown thread reveals a collapsed aside. */
  asideThreadKey?: string | null;
};

export function ResizableRightSidebarLayout({
  main,
  aside,
  storageKey,
  collapsedStorageKey,
  defaultCollapsed,
  className,
  mainClassName,
  asideClassName,
  minAsideWidth = 22 * 16,
  defaultAsideWidth = 26 * 16,
  minMainWidth = 44 * 16,
  mobileDefaultPanel = "main",
  mobileMainLabel,
  mobileAsideLabel,
  mobileAsideRequest,
  asideThreadKey,
}: ResizableRightSidebarLayoutProps) {
  const isDesktop = useMediaQuery("lg");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"main" | "aside">(mobileDefaultPanel);
  const widthStorageKey = `${storageKey}:width`;
  const resolvedCollapsedStorageKey = collapsedStorageKey ?? `${storageKey}:collapsed`;
  const { asideWidth, setAsideWidth, isCollapsed, setCollapsedState } = useStoredRightSidebarState({
    widthStorageKey,
    collapsedStorageKey: resolvedCollapsedStorageKey,
    defaultAsideWidth,
    ...(defaultCollapsed !== undefined ? { defaultCollapsed } : {}),
  });
  const { asideCollapsed, toggleCollapsed } = useAsideReveal({
    scopeKey: resolvedCollapsedStorageKey,
    itemRequest: mobileAsideRequest,
    threadKey: asideThreadKey,
    isCollapsed,
    setCollapsedState,
  });
  // Side by side only while both panes get their minimum; a narrower pane switches to the
  // one-at-a-time tabs instead of squeezing the main content into a sliver.
  const pane = useElementFitsWidth(minMainWidth + minAsideWidth);
  const showTabs = !isDesktop || (!asideCollapsed && !pane.fits);
  const measurePane = pane.ref;
  const setContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      measurePane(node);
    },
    [measurePane],
  );
  const dragStateRef = useRef<ResizableRightSidebarDragState | null>(null);

  useEffect(
    () => () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    },
    [],
  );

  useEffect(() => {
    if (mobileAsideRequest) setMobilePanel("aside");
    else if (!isDesktop) setMobilePanel(mobileDefaultPanel);
  }, [isDesktop, mobileDefaultPanel, mobileAsideRequest]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isDesktop || event.button !== 0 || !containerRef.current || asideCollapsed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        currentWidth: asideWidth,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: asideWidth,
        handle: event.currentTarget,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [asideWidth, asideCollapsed, isDesktop],
  );

  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      const container = containerRef.current;
      if (!dragState || !container || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const delta = dragState.startX - event.clientX;
      const maxAsideWidth = Math.max(minAsideWidth, container.clientWidth - minMainWidth);
      const nextWidth = clampRightSidebarWidth(
        dragState.startWidth + delta,
        minAsideWidth,
        maxAsideWidth,
      );
      dragState.currentWidth = nextWidth;
      setAsideWidth(nextWidth);
    },
    [minAsideWidth, minMainWidth],
  );

  const stopResize = useCallback(
    (pointerId: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) {
        return;
      }

      dragStateRef.current = null;
      if (dragState.handle.hasPointerCapture(pointerId)) {
        dragState.handle.releasePointerCapture(pointerId);
      }
      setLocalStorageItem(widthStorageKey, dragState.currentWidth, Schema.Finite);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    },
    [widthStorageKey],
  );

  const handleResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      stopResize(event.pointerId);
    },
    [stopResize],
  );

  const handleResizePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      stopResize(event.pointerId);
    },
    [stopResize],
  );

  if (showTabs) {
    return (
      <div ref={pane.ref} className="flex h-full min-h-0 min-w-0 flex-1">
        <T3TeamMobilePanelLayout
          activePanel={mobilePanel}
          onActivePanelChange={setMobilePanel}
          main={main}
          aside={aside}
          className={className}
          mainClassName={mainClassName}
          asideClassName={asideClassName}
          mainLabel={mobileMainLabel}
          asideLabel={mobileAsideLabel}
        />
      </div>
    );
  }

  return (
    <div
      ref={setContainerNode}
      // Main-content headers key their right-edge reservation for the floating toggle off this.
      data-right-sidebar={asideCollapsed ? "collapsed" : "expanded"}
      className={cn("relative h-full min-h-0 flex flex-1 overflow-hidden", className)}
      style={
        {
          "--right-sidebar-width": `${asideWidth}px`,
          // The floating toggle's footprint from the right edge, for main-content headers.
          "--right-sidebar-toggle-inset":
            "calc(var(--workspace-controls-right) + var(--workspace-titlebar-control-size) + 0.5rem)",
        } as CSSProperties
      }
    >
      <div className={cn("h-full min-h-0 min-w-0 flex-1 overflow-hidden", mainClassName)}>
        {main}
      </div>
      <ResizableRightSidebarAside
        aside={aside}
        asideClassName={asideClassName}
        asideWidth={asideWidth}
        isCollapsed={asideCollapsed}
        onResizePointerCancel={handleResizePointerCancel}
        onResizePointerDown={handleResizePointerDown}
        onResizePointerMove={handleResizePointerMove}
        onResizePointerUp={handleResizePointerUp}
        onToggleCollapsed={toggleCollapsed}
      />
    </div>
  );
}
