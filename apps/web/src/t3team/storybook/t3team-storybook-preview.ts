import { createElement, type CSSProperties } from "react";
import type { Decorator, Preview } from "@storybook/react";

// The app's main stylesheet first, as main.tsx loads it: its @theme defines the type scale
// (text-2xs, text-3xs, …). Without it those classes were never generated here and stories
// rendered small labels at the inherited size, unlike the app.
import "~/index.css";
import "~/t3team/t3team-index.css";
// Must come after the app stylesheet so it wins on the canvas-scrolling rules.
import "~/t3team/storybook/t3team-storybook-canvas.css";

/*
 * Apply `.dark` on html, body, and a wrapper. Honor globals.theme, and a "Dark"
 * story name when the toolbar global is unset, so Dark stories do not render light.
 */
const storyIsDark = (context: {
  readonly globals?: Record<string, unknown>;
  readonly parameters?: {
    readonly theme?: unknown;
    readonly globals?: { readonly theme?: unknown };
  };
  readonly name?: string;
  readonly story?: string;
  readonly id?: string;
}): boolean => {
  const globalTheme =
    context.globals?.theme ?? context.parameters?.globals?.theme ?? context.parameters?.theme;
  if (globalTheme === "dark") return true;
  if (globalTheme === "light") return false;
  const name = `${context.name ?? ""} ${context.story ?? ""} ${context.id ?? ""}`;
  return /Dark/.test(name);
};

const themeDecorator: Decorator = (Story, context) => {
  const isDark = storyIsDark(context);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    document.body.classList.toggle("dark", isDark);
    document.body.style.colorScheme = isDark ? "dark" : "light";
    document.body.style.background = isDark ? "#000000" : "#ffffff";
  }
  const style: CSSProperties = {
    minHeight: "100%",
    colorScheme: isDark ? "dark" : "light",
    background: isDark ? "#000000" : "#ffffff",
  };
  return createElement(
    "div",
    {
      className: isDark ? "dark h-full min-h-full" : "h-full min-h-full",
      style,
      "data-story-theme": isDark ? "dark" : "light",
    },
    createElement(Story),
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      type: "select",
      options: ["light", "dark"],
      initialValue: "light",
      description: "Canvas theme (drives the app's .dark class).",
    },
  } as unknown as NonNullable<Preview["globalTypes"]>,
  decorators: [themeDecorator],
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: true,
    },
    viewport: {
      options: {
        responsive: {
          name: "Responsive",
          styles: { width: "100%", height: "100%" },
          type: "desktop",
        },
        phone: {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        tablet: {
          name: "Tablet",
          styles: { width: "834px", height: "1112px" },
          type: "tablet",
        },
      },
    },
  },
};

export default preview;
