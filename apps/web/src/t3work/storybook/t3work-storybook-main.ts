/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import type { StorybookConfig } from "@storybook/react-vite";
import * as NodeURL from "node:url";
import { mergeConfig } from "vite";

const srcDir =
  process.env.T3WORK_STORYBOOK_SRC_DIR ?? NodeURL.fileURLToPath(new URL("../src", import.meta.url));

const config: StorybookConfig = {
  stories: [`${srcDir}/t3work/**/*.stories.tsx`],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: false,
  },
  viteFinal: async (config) => {
    const merged = mergeConfig(config, {
      plugins: [
        babel({
          parserOpts: { plugins: ["typescript", "jsx"] },
          presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
      ],
      resolve: {
        alias: {
          "~": srcDir,
        },
      },
      define: {
        "import.meta.env.VITE_WS_URL": JSON.stringify(""),
        "import.meta.env.VITE_HOSTED_APP_URL": JSON.stringify(""),
        "import.meta.env.VITE_HOSTED_APP_CHANNEL": JSON.stringify("storybook"),
        "import.meta.env.APP_VERSION": JSON.stringify("storybook"),
        __ATLASSIAN_CLIENT_ID__: JSON.stringify(""),
        __ATLASSIAN_SITE_URL__: JSON.stringify(""),
        __ATLASSIAN_OAUTH_REDIRECT_URI__: JSON.stringify(""),
      },
    });

    // apps/web/vite.config.ts prebundles Clerk for the full app; Storybook does not
    // depend on @clerk/clerk-js directly and Vite can hang on "bundling dependencies".
    const clerkDeps = ["@clerk/clerk-js", "@clerk/react/internal"];
    const include = (merged.optimizeDeps?.include ?? []).filter(
      (dep: string) => !clerkDeps.includes(String(dep)),
    );
    const exclude = [...new Set([...(merged.optimizeDeps?.exclude ?? []), ...clerkDeps])];
    merged.optimizeDeps = { ...merged.optimizeDeps, include, exclude };

    return merged;
  },
};

export default config;
