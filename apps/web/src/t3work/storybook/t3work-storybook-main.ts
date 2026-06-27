/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import type { StorybookConfig } from "@storybook/react-vite";
import * as NodeURL from "node:url";
import { mergeConfig } from "vite";

const srcDir = NodeURL.fileURLToPath(new URL("../src", import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/t3work/stories/**/*.stories.tsx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
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
      },
    }),
};

export default config;
