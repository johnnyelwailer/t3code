/**
 * The host's implementation of `@t3team/pack-ui`. The web build resolves that specifier here (the
 * distribution web plugin for pack files, `tsconfig` paths inside this app), so a pack gets the
 * app's own primitives — one copy of each — and nothing else of the app.
 *
 * Imports the contract by its `/contract` subpath: importing `@t3team/pack-ui` here would resolve
 * back to this file.
 */
import type { PackUiHostKit } from "@t3team/pack-ui/contract";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";

import { PackMarkdown } from "./t3team-PackMarkdown";
import { usePackDocument, usePackDocuments } from "./t3team-packDocuments";

export * from "@t3team/pack-ui/contract";

const hostKit = {
  Button,
  Badge,
  Skeleton,
  Markdown: PackMarkdown,
  usePackDocument,
  usePackDocuments,
} satisfies PackUiHostKit;

export const { Markdown } = hostKit;
export { Badge, Button, Skeleton, usePackDocument, usePackDocuments };
