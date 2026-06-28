import { T3workRecentConversations } from "~/t3work/t3work-ProjectDashboardRecentConversations";
import {
  orderT3workSidecarSectionItems,
  type T3workSidecarSectionShellProps,
} from "~/t3work/t3work-sidecarSectionShellProps";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";
import type { ProjectThread } from "~/t3work/t3work-types";

export type RecentConversationsSectionProps = {
  readonly threads: ReadonlyArray<ProjectThread>;
  readonly emptyMessage?: string | undefined;
  readonly searchPlaceholder?: string | undefined;
  readonly showSearch?: boolean | undefined;
  readonly showCount?: boolean | undefined;
  readonly shell?: T3workSidecarSectionShellProps<ProjectThread> | undefined;
};

function isRecentConversationsSectionProps(
  props: unknown,
): props is RecentConversationsSectionProps {
  return typeof props === "object" && props !== null && "threads" in props;
}

export function resolveRecentConversationsSectionIsEmpty(props: unknown): boolean {
  if (!isRecentConversationsSectionProps(props)) {
    return true;
  }

  return (props.threads?.length ?? 0) === 0;
}

export function T3workRecentConversationsSection({
  host,
  props,
}: {
  host: SidecarSectionHost;
  props?: unknown;
}) {
  const sectionProps = props as RecentConversationsSectionProps | undefined;
  const orderedThreads = orderT3workSidecarSectionItems({
    items: [...(sectionProps?.threads ?? [])],
    getItemId: (thread) => thread.id,
    shell: sectionProps?.shell,
  });

  if (orderedThreads.length === 0) {
    return null;
  }

  return (
    <T3workRecentConversations
      threads={orderedThreads}
      onOpenThread={host.openThread}
      showHeader={false}
      {...(sectionProps?.emptyMessage ? { emptyMessage: sectionProps.emptyMessage } : {})}
      {...(sectionProps?.searchPlaceholder
        ? { searchPlaceholder: sectionProps.searchPlaceholder }
        : {})}
      {...(sectionProps?.showSearch !== undefined ? { showSearch: sectionProps.showSearch } : {})}
      {...(sectionProps?.showCount !== undefined ? { showCount: sectionProps.showCount } : {})}
      renderThread={
        sectionProps?.shell?.wrapItem
          ? (thread, content) => sectionProps.shell?.wrapItem?.(thread, content) ?? content
          : undefined
      }
    />
  );
}
