/** The kit fixture pack's web entry: one message view showing every `pack-ui` primitive. */
import { defineWebActivate } from "@t3team/pack-ui";
import * as Schema from "effect/Schema";

import { KitShowcaseView } from "./t3team-KitShowcase";

export default defineWebActivate((context) => {
  context.registerView({
    slot: "message.view",
    id: "kitfixture.showcase",
    props: Schema.Struct({ title: Schema.String }),
    component: KitShowcaseView,
  });
});
