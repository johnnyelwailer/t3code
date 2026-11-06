// No rule without a pack value: an empty variable would still erase upstream's shadow and hover.
// `:enabled` keeps the neutral disabled look; `background-image` leaves upstream's colour beneath.
const SEND_BUTTON = "[data-composer-send-button]:enabled";

function rules(scope: string, colors: Readonly<Record<string, string>>): string {
  const background = colors.primaryActionBackground;
  if (!background) return "";
  const shadow = colors.primaryActionShadow ? `;box-shadow:${colors.primaryActionShadow}` : "";
  return `${scope} ${SEND_BUTTON}{background-image:${background}${shadow}}${scope} ${SEND_BUTTON}:hover{filter:brightness(1.08)}`;
}

/** `theme` is the pack theme's attribute selector, so a user-chosen theme keeps its own button. */
export function packPrimaryActionCss(
  colors: {
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  },
  theme: string,
): string {
  return rules(`html:not(.dark)${theme}`, colors.light) + rules(`html.dark${theme}`, colors.dark);
}
