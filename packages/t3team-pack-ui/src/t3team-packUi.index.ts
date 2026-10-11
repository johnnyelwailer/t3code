/**
 * `@t3team/pack-ui` as a pack author imports it. The runtime values are declarations only: the
 * host web build aliases this specifier to its implementation (`t3team-packUiImpl.ts` in the web
 * app), which is checked against `PackUiHostKit`. Importing this file outside a host build gives
 * the types and nothing else.
 */
import type { PackUiHostKit } from "./t3team-packUi.contract.ts";

export * from "./t3team-packUi.contract.ts";

export declare const cn: PackUiHostKit["cn"];
export declare const Alert: PackUiHostKit["Alert"];
export declare const AlertTitle: PackUiHostKit["AlertTitle"];
export declare const AlertDescription: PackUiHostKit["AlertDescription"];
export declare const Badge: PackUiHostKit["Badge"];
export declare const Button: PackUiHostKit["Button"];
export declare const Popover: PackUiHostKit["Popover"];
export declare const PopoverTrigger: PackUiHostKit["PopoverTrigger"];
export declare const PopoverPopup: PackUiHostKit["PopoverPopup"];
export declare const Skeleton: PackUiHostKit["Skeleton"];
export declare const Spinner: PackUiHostKit["Spinner"];
export declare const Table: PackUiHostKit["Table"];
export declare const TableHeader: PackUiHostKit["TableHeader"];
export declare const TableBody: PackUiHostKit["TableBody"];
export declare const TableRow: PackUiHostKit["TableRow"];
export declare const TableHead: PackUiHostKit["TableHead"];
export declare const TableCell: PackUiHostKit["TableCell"];
export declare const Textarea: PackUiHostKit["Textarea"];
export declare const Tooltip: PackUiHostKit["Tooltip"];
export declare const TooltipTrigger: PackUiHostKit["TooltipTrigger"];
export declare const TooltipPopup: PackUiHostKit["TooltipPopup"];
export declare const Markdown: PackUiHostKit["Markdown"];
export declare const WidgetFrame: PackUiHostKit["WidgetFrame"];
export declare const Icon: PackUiHostKit["Icon"];
export declare const useMediaQuery: PackUiHostKit["useMediaQuery"];
export declare const useReducedMotion: PackUiHostKit["useReducedMotion"];
export declare const observeVisibleAnimation: PackUiHostKit["observeVisibleAnimation"];
export declare const useVisibleAnimation: PackUiHostKit["useVisibleAnimation"];
export declare const useNavigation: PackUiHostKit["useNavigation"];
export declare const usePackDocument: PackUiHostKit["usePackDocument"];
export declare const usePackDocuments: PackUiHostKit["usePackDocuments"];
export declare const launchRecipe: PackUiHostKit["launchRecipe"];
