/**
 * Imperative band chrome sync (gauge label highlight, prev/next visibility)
 * plus the view-scoped stylesheet. Extracted from t3team-PlanningSpaceView.tsx.
 */

import { planningGaugeActiveLabel } from "./t3team-planningSpaceScene";

const GAUGE_ACTIVE_CLASS = "text-left text-3xs leading-6 text-primary";
const GAUGE_IDLE_CLASS = "text-left text-3xs leading-6 text-muted-foreground hover:text-foreground";

export function syncPlanningBandChrome(input: {
  band: number;
  allMode: boolean;
  gaugeButtons: ReadonlyMap<string, HTMLButtonElement>;
  navPrev: HTMLButtonElement | null;
  navNext: HTMLButtonElement | null;
}): void {
  const bandLabelForActive = planningGaugeActiveLabel(input.band);
  for (const [label, button] of input.gaugeButtons) {
    const isActive = input.allMode ? label === "All" : label === bandLabelForActive;
    button.className = isActive ? GAUGE_ACTIVE_CLASS : GAUGE_IDLE_CLASS;
  }
  const showNav = input.band >= 5 && !input.allMode;
  for (const button of [input.navPrev, input.navNext]) {
    if (button) button.style.display = showNav ? "" : "none";
  }
}

// Part hooks are `data-t3ps` tokens (space-separated, matched with `~=`), not
// class names: a class Tailwind does not generate fails shadcn/no-unknown-classes,
// and the engine/hit-test query the same attribute.
export const PLANNING_SPACE_CSS = `
[data-t3ps~="root"] button{cursor:pointer}
[data-t3ps~="node"]{position:absolute;left:0;top:0;visibility:hidden;will-change:transform}
[data-t3ps~="inner"]{position:absolute;left:0;top:0;transform:translate(-50%,-50%)}
[data-t3ps~="dot"]{display:none;width:14px;height:14px;border-radius:9999px;cursor:pointer}
[data-t3ps~="card"]{width:104px;padding:6px 8px;cursor:pointer}
[data-t3ps~="node"][data-live="true"] [data-t3ps~="card"]{transition:width .35s ease-out}
[data-t3ps~="node"][data-band="5"] [data-t3ps~="card"]{cursor:default}
[data-t3ps~="anchor"]{cursor:pointer}
[data-t3ps~="node"][data-band="0"] [data-t3ps~="card"]{display:none}
[data-t3ps~="node"][data-band="0"] [data-t3ps~="dot"]{display:block}
[data-t3ps~="node"][data-band="0"] [data-t3ps~="title"],[data-t3ps~="node"][data-band="1"] [data-t3ps~="title"]{display:none}
[data-t3ps~="node"][data-band="1"] [data-t3ps~="avatar"]{display:none}
[data-t3ps~="node"][data-band="2"] [data-t3ps~="card"]{width:210px}
[data-t3ps~="node"][data-band="3"] [data-t3ps~="card"]{width:352px}
[data-t3ps~="node"][data-band="4"] [data-t3ps~="card"]{width:424px}
[data-t3ps~="node"][data-band="5"] [data-t3ps~="card"]{width:470px}
[data-t3ps~="subdots"]{display:none}
[data-t3ps~="node"][data-band="2"] [data-t3ps~="subdots"]{display:flex}
[data-t3ps~="subgrid"]{display:none}
[data-t3ps~="node"][data-band="3"] [data-t3ps~="subgrid"],[data-t3ps~="node"][data-band="4"] [data-t3ps~="subgrid"],[data-t3ps~="node"][data-band="5"] [data-t3ps~="subgrid"]{display:grid}
[data-t3ps~="node"][data-band="4"] [data-t3ps~="substep"],[data-t3ps~="node"][data-band="5"] [data-t3ps~="substep"]{display:flex}
[data-t3ps~="node"][data-band="3"] [data-t3ps~="subtitle"]{-webkit-line-clamp:1}
[data-t3ps~="node"][data-band="4"] [data-t3ps~="subtitle"],[data-t3ps~="node"][data-band="5"] [data-t3ps~="subtitle"]{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
[data-t3ps~="anchor"]{transition:outline-color .2s}
[data-t3ps~="elabel"]{width:240px}
[data-t3ps~="node"][data-band="0"] [data-t3ps~="elabel"]{width:150px}
[data-t3ps~="node"][data-band="0"] [data-t3ps~="estat"]{display:none}
[data-t3ps~="allov"]{animation:t3psFadeIn .35s ease-out}
[data-t3ps~="allov"]>button{animation:t3psRise .35s ease-out backwards}
@keyframes t3psFadeIn{from{opacity:0}to{opacity:1}}
@keyframes t3psRise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
[data-drop-hot]{outline:2px dashed var(--primary, #7c89ff);outline-offset:3px;border-radius:8px}
`;
