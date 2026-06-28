import { useMemo } from "react";
import type { Decorator } from "@storybook/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

const DEFAULT_STORYBOOK_PATH = "/t3work/projects/project-1";

function StorybookRouterShell({
  renderStory,
  initialPath,
  storyKey,
}: {
  readonly renderStory: () => React.ReactNode;
  readonly initialPath: string;
  readonly storyKey: string;
}) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({
      component: () => <>{renderStory()}</>,
    });

    return createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({
        initialEntries: [initialPath],
      }),
      context: {},
    });
  }, [storyKey, initialPath]);

  return <RouterProvider router={router} />;
}

export const withT3workStorybookRouter: Decorator = (Story, { id, parameters }) => {
  const initialPath =
    typeof parameters.router?.initialPath === "string"
      ? parameters.router.initialPath
      : DEFAULT_STORYBOOK_PATH;

  return (
    <StorybookRouterShell
      storyKey={id}
      initialPath={initialPath}
      renderStory={() => <Story />}
    />
  );
};
