import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";

/** The distribution's extra workspace tab, isolated from the stock workspace; nothing without one. */
export function WorkspaceExtraTabPane(props: { readonly tab: WorkspaceExtraTab | null }) {
  const Content = props.tab?.Component;
  return Content ? (
    <ExtensionBoundary>
      <Content />
    </ExtensionBoundary>
  ) : null;
}
