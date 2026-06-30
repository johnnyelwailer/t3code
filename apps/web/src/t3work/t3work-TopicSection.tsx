import type { ReactNode } from "react";

import { T3workSidecarSectionFrame } from "~/t3work/t3work-sidecarSectionFrame";

export function T3workTopicSection({
  sectionId,
  title,
  collapsed = false,
  onToggleCollapsed,
  children,
}: {
  readonly sectionId: string;
  readonly title: string;
  readonly collapsed?: boolean;
  readonly onToggleCollapsed?: () => void;
  readonly children: ReadonlyArray<ReactNode> | ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const visibleItems = items.filter((item) => item !== null && item !== undefined && item !== false);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <T3workSidecarSectionFrame
      sectionId={sectionId}
      title={title}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed ?? (() => {})}
      menuEntries={[]}
    >
      <div className="space-y-2.5">{visibleItems}</div>
    </T3workSidecarSectionFrame>
  );
}
