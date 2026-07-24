import type { Preview } from "@storybook/react";

import "~/t3team/t3team-index.css";
import { withT3workStorybookRouter } from "~/t3team/storybook/t3team-storybookRouterDecorator";

const preview: Preview = {
  decorators: [withT3workStorybookRouter],
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
