/**
 * `@t3team/pack-ui` as a pack author imports it. The runtime values are declarations only: the
 * host web build aliases this specifier to its implementation (`t3team-packUiImpl.ts` in the web
 * app), which is checked against `PackUiHostKit`. Importing this file outside a host build gives
 * the types and nothing else.
 */
import type { PackUiHostKit } from "./t3team-packUi.contract.ts";

export * from "./t3team-packUi.contract.ts";

export declare const Button: PackUiHostKit["Button"];
export declare const Badge: PackUiHostKit["Badge"];
export declare const Skeleton: PackUiHostKit["Skeleton"];
export declare const Markdown: PackUiHostKit["Markdown"];
export declare const usePackDocument: PackUiHostKit["usePackDocument"];
export declare const usePackDocuments: PackUiHostKit["usePackDocuments"];
