import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { Outlet, createFileRoute, redirect, useMatches } from "@tanstack/react-router";
import { useState } from "react";

import { ThreadRouteView } from "../components/ThreadRouteView";
import { isAppModalPage } from "../components/sidebar/mainAppLocation";
import { SidebarInset } from "../components/ui/sidebar";
import { resolveThreadRouteTarget, type ThreadRouteTarget } from "../threadRoutes";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { readThreadShells } from "../state/entities";
import { translateUpstreamPath } from "../t3team/t3team-upstreamRouteBridge";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";

function threadRouteTargetKey(target: ThreadRouteTarget | null) {
  if (!target) return null;
  return target.kind === "server" ? scopedThreadKey(target.threadRef) : target.draftId;
}

function ChatRouteLayout() {
  // Render both routes here so draft promotion keeps the same ChatView mounted.
  const threadTarget = useThreadRouteTarget();
  // Read matches, not location, so this agrees with the params useThreadRouteTarget reads.
  const modalOpen = useMatches({
    select: (matches) => matches.some((match) => isAppModalPage(match.pathname)),
  });
  // Settings and Usage render over the thread that opened them, so ChatView never remounts.
  const [backgroundTarget, setBackgroundTarget] = useState(threadTarget);
  if (!modalOpen && threadRouteTargetKey(backgroundTarget) !== threadRouteTargetKey(threadTarget)) {
    setBackgroundTarget(threadTarget);
  }
  const shownTarget = modalOpen ? backgroundTarget : threadTarget;
  return (
    <>
      {shownTarget?.kind === "server" && !modalOpen ? (
        <ThreadLinkPrompt threadRef={shownTarget.threadRef} />
      ) : null}
      {shownTarget ? (
        <ThreadRouteView target={shownTarget} background={modalOpen} />
      ) : modalOpen ? (
        <SidebarInset className="h-dvh" />
      ) : (
        <Outlet />
      )}
      {modalOpen ? <Outlet /> : null}
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }

    // T3 Team is the permanent shell: upstream's sidebar navigates with
    // upstream's own route shapes (`/`, `/$environmentId/$threadId`,
    // `/draft/$draftId`), all of which live under this layout route. Resolving
    // the equivalent Team route here — synchronously, before this route ever
    // commits — means a thread row click never renders this tree at all.
    // Doing the same translation reactively (the __root.tsx bridge effect,
    // which still covers deep links this beforeLoad can't reach, e.g. history
    // navigation that bypasses the router) requires this route to mount
    // first and then bounce away, which unmounts the whole Team shell
    // (including the sidebar) for a frame and remounts it fresh — silently
    // resetting any component-local sidebar state, such as the project scope
    // selector, back to its default.
    const translation = translateUpstreamPath(location.pathname, {
      resolveProjectIdForThread: ({ environmentId, threadId }) =>
        readThreadShells().find(
          (shell) => shell.id === threadId && shell.environmentId === environmentId,
        )?.projectId ??
        // Deep links can arrive before the environment id is known locally; a
        // unique thread id is still enough to place the thread.
        readThreadShells().find((shell) => shell.id === threadId)?.projectId ??
        null,
      primaryEnvironmentId: appAtomRegistry.get(primaryEnvironmentIdAtom),
      // Environment discovery is never settled this early; the reactive bridge decides whether a
      // non-primary environment is really absent.
      knownEnvironmentIds: null,
    });
    if (translation.kind === "target") {
      throw redirect(translation.target);
    }
    if (translation.kind === "unhandled") {
      // t3team: the concrete unhandled path is a race, not a bad link. Both
      // segments of `/$environmentId/$threadId` are already known here, but
      // resolveProjectIdForThread still misses when this environment's
      // thread shells haven't finished syncing into the entities store yet
      // (readThreadShells() above is a synchronous snapshot of an
      // asynchronously-populated atom) — e.g. a thread click landing right
      // after a cold load, or for an environment whose shells are still
      // in flight. That drops projectId to null and lands here.
      // This redirect to /t3team used to also reset the sidebar's
      // component-local project scope back to "All projects" on remount.
      // Now that projectScopeKey is persisted in sessionStorage (see
      // Sidebar.tsx), the remount restores the scope, so this fallback is
      // safe to keep as a plain redirect rather than adding wait/passthrough
      // logic here.
      throw redirect({ to: "/t3team" });
    }

    return { appModalPage: isAppModalPage(location.pathname) };
  },
  component: ChatRouteLayout,
  // Every match carries the whole location's params, so this layout sees the thread route's too.
  onEnter: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onStay: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onLeave: () => retainThreadFindForRoute({ modalPage: false, threadRef: null }),
});

function retainThreadFindForRouteMatch(
  modalPage: boolean,
  params: Partial<Record<"environmentId" | "threadId", string>>,
) {
  const target = resolveThreadRouteTarget(params);
  retainThreadFindForRoute({
    modalPage,
    threadRef: target?.kind === "server" ? target.threadRef : null,
  });
}
