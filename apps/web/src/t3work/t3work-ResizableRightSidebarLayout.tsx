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
import { useMediaQuery } from "~/t3work/hooks/t3work-useMediaQuery";
import { getLocalStorageItem, setLocalStorageItem } from "~/t3work/hooks/t3work-useLocalStorage";
import { T3workMobilePanelLayout } from "~/t3work/t3work-MobilePanelLayout";
import {
  clampRightSidebarWidth,
  readStoredRightSidebarCollapsedState,
  type ResizableRightSidebarDragState,
} from "~/t3work/t3work-ResizableRightSidebarLayoutShared";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import { ResizableRightSidebarAside } from "./t3work-ResizableRightSidebarAside";

type ResizableRightSidebarLayoutProps = {
  main: ReactNode;
  aside: ReactNode;
  storageKey: string;
  collapsedStorageKey?: string;
  className?: string;
  mainClassName?: string;
  asideClassName?: string;
  minAsideWidth?: number;
  defaultAsideWidth?: number;
  minMainWidth?: number;
  mobileDefaultPanel?: "main" | "aside";
  mobileMainLabel?: string;
  mobileAsideLabel?: string;
};

export function ResizableRightSidebarLayout({
  main,
  aside,
  storageKey,
  collapsedStorageKey,
  className,
  mainClassName,
  asideClassName,
  minAsideWidth = 22 * 16,
  defaultAsideWidth = 26 * 16,
  minMainWidth = 44 * 16,
  mobileDefaultPanel = "main",
  mobileMainLabel,
  mobileAsideLabel,
}: ResizableRightSidebarLayoutProps) {
  const isDesktop = useMediaQuery("lg");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [asideWidth, setAsideWidth] = useState(defaultAsideWidth);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"main" | "aside">(mobileDefaultPanel);
  const widthStorageKey = `${storageKey}:width`;
  const effectiveCollapsedStorageKey = collapsedStorageKey ?? `${storageKey}:collapsed`;
  const dragStateRef = useRef<ResizableRightSidebarDragState | null>(null);

  useEffect(() => {
    const storedWidth = getLocalStorageItem(widthStorageKey, Schema.Finite);
    if (storedWidth !== null) {
      setAsideWidth(storedWidth);
    }

    setIsCollapsed(readStoredRightSidebarCollapsedState(effectiveCollapsedStorageKey));
  }, [effectiveCollapsedStorageKey, widthStorageKey]);

  useEffect(
    () => () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    },
    [],
  );

  useEffect(() => {
    if (!isDesktop) {
      setMobilePanel(mobileDefaultPanel);
    }
  }, [isDesktop, mobileDefaultPanel]);

  const setCollapsedState = useCallback(
    (nextCollapsed: boolean) => {
      runT3workViewTransition(() => {
        setIsCollapsed(nextCollapsed);
        setLocalStorageItem(effectiveCollapsedStorageKey, nextCollapsed, Schema.Boolean);
      });
    },
    [effectiveCollapsedStorageKey],
  );

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isDesktop || event.button !== 0 || !containerRef.current || isCollapsed) {
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
    [asideWidth, isCollapsed, isDesktop],
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

  if (!isDesktop) {
    return (
      <T3workMobilePanelLayout
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
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full min-h-0 flex flex-1 overflow-hidden", className)}
      style={
        {
          "--right-sidebar-width": `${asideWidth}px`,
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
        isCollapsed={isCollapsed}
        onResizePointerCancel={handleResizePointerCancel}
        onResizePointerDown={handleResizePointerDown}
        onResizePointerMove={handleResizePointerMove}
        onResizePointerUp={handleResizePointerUp}
        onToggleCollapsed={() => setCollapsedState(!isCollapsed)}
      />
    </div>
  );
}
