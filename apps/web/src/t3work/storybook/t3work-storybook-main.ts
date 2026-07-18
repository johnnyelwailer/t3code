/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import type { StorybookConfig } from "@storybook/react-vite";
import * as NodeURL from "node:url";
import { mergeConfig } from "vite";

const srcDir =
  process.env.T3WORK_STORYBOOK_SRC_DIR ?? NodeURL.fileURLToPath(new URL("../src", import.meta.url));

// Serves a workspace pack directory at /pack so branding stories can preview
// real distribution themes: T3WORK_STORYBOOK_PACK_DIR=<pack dir> vp run storybook.
const packDir = process.env.T3WORK_STORYBOOK_PACK_DIR;

const config: StorybookConfig = {
  stories: [`${srcDir}/t3work/stories/**/*.stories.tsx`],
  staticDirs: packDir ? [{ from: packDir, to: "/pack" }] : [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) =>
    mergeConfig(config, {
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
    }),
};

export default config;
