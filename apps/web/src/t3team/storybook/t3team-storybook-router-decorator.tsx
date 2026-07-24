import { useMemo } from "react";
import type { Decorator } from "@storybook/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import type { AppRouter } from "~/router";

/**
 * Storybook decorator that mounts the story inside a real (in-memory) TanStack
 * RouterProvider so components that call router hooks (useNavigate,
 * useRouterState, ...) resolve instead of throwing
 * `Cannot read properties of null (reading 'isServer')`.
 *
 * Reuses the same TanStack primitives as the app's `getRouter()` (router.ts),
 * but with a minimal single-root route that renders the story rather than the
 * full generated `routeTree` — RouterProvider renders its matched route, not its
 * children, so a bare app router would never render the story component.
 */
// Generic so it adapts to each story's args type; the router setup itself is
// args-agnostic.
export function withT3TeamRouter<TArgs>(
  ...params: Parameters<Decorator<TArgs>>
): ReturnType<Decorator<TArgs>> {
  const [Story] = params;
  const router = useMemo(() => {
    const rootRoute = createRootRoute({ component: () => <Story /> });
    return createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    // Story identity is stable per rendered story; the router is intentionally
    // built once so its in-memory location survives re-renders.
  }, []);
  // The app augments TanStack's `Register` with the real AppRouter; this minimal
  // router is structurally compatible for provider purposes.
  return <RouterProvider router={router as unknown as AppRouter} />;
}
