import type { ReactNode } from "react";
import type { ToolAuthState } from "@t3tools/contracts";

import { ClaudeAI, CursorIcon, GrokIcon, OpenAI, OpenCodeIcon } from "~/components/Icons";
import { NexploreAI } from "~/components/t3team-NexploreAIIcon";

import { dispatchWelcomeAgentAction } from "./t3team-welcomeActionDispatch";
import type { WelcomeAgentRowModel, WelcomeAgentTool } from "./t3team-welcomeAgents.logic";
import {
  PrimaryAction,
  SecondaryAction,
  ServiceMark,
  StatusLabel,
  WelcomeItem,
} from "./t3team-welcomeLayout";

function agentMark(driver: string): ReactNode {
  if (driver === "nexplore") return <NexploreAI aria-hidden />;
  if (driver === "claudeAgent") return <ClaudeAI aria-hidden />;
  if (driver === "codex") return <OpenAI aria-hidden />;
  if (driver === "cursor") return <CursorIcon aria-hidden />;
  if (driver === "grok") return <GrokIcon aria-hidden />;
  if (driver === "opencode") return <OpenCodeIcon aria-hidden />;
  return <span className="text-xs font-semibold uppercase">{driver.slice(0, 2)}</span>;
}

export type NexiWelcomeAgentsSectionProps = {
  readonly rows: readonly WelcomeAgentRowModel[];
  readonly toolStates: ReadonlyMap<string, ToolAuthState | undefined>;
  readonly onInstall: (tool: WelcomeAgentTool) => void;
  readonly onSignIn: (tool: WelcomeAgentTool) => void;
  readonly onCopyAndOpenTool: (tool: WelcomeAgentTool) => void;
  readonly onOpenProviderSetup: (instanceId: string) => void;
};

function toolForRow(row: WelcomeAgentRowModel): WelcomeAgentTool | null {
  if (row.action.kind === "toolAuthInstall" || row.action.kind === "toolAuthSignIn") {
    return row.action.tool;
  }
  if (row.driver === "claudeAgent") return "claude";
  if (row.driver === "codex") return "codex";
  return null;
}

export function NexiWelcomeAgentsSection({
  rows,
  toolStates,
  onInstall,
  onSignIn,
  onCopyAndOpenTool,
  onOpenProviderSetup,
}: NexiWelcomeAgentsSectionProps) {
  return (
    <>
      {rows.map((row) => {
        const tool = toolForRow(row);
        const toolState = tool ? toolStates.get(tool) : undefined;
        const phase = toolState?.phase;

        if (phase === "awaiting-open") {
          return (
            <WelcomeItem
              key={row.key}
              mark={<ServiceMark label={row.title}>{agentMark(row.driver)}</ServiceMark>}
              title={row.title}
              description={
                toolState?.displayCode ? (
                  <span className="font-mono font-medium tracking-wider text-foreground">
                    {toolState.displayCode}
                  </span>
                ) : (
                  "Finish in your browser"
                )
              }
              status={<StatusLabel status="pending" label="Waiting" />}
              action={
                tool ? (
                  <PrimaryAction onClick={() => onCopyAndOpenTool(tool)}>
                    Copy code & open
                  </PrimaryAction>
                ) : undefined
              }
            />
          );
        }

        if (
          phase === "installing" ||
          phase === "starting" ||
          phase === "awaiting-code" ||
          phase === "verifying"
        ) {
          return (
            <WelcomeItem
              key={row.key}
              mark={<ServiceMark label={row.title}>{agentMark(row.driver)}</ServiceMark>}
              title={row.title}
              description={phase === "installing" ? "Installing…" : "Signing in…"}
              status={<StatusLabel status="pending" label="Waiting" />}
            />
          );
        }

        if (phase === "connected" || row.state === "ready") {
          return (
            <WelcomeItem
              key={row.key}
              mark={<ServiceMark label={row.title}>{agentMark(row.driver)}</ServiceMark>}
              title={row.title}
              status={<StatusLabel status="ready" label="Ready" />}
            />
          );
        }

        // Nexplore AI: no install/sign-in; health probe failure is a muted hint only.
        if (row.driver === "nexplore") {
          return (
            <WelcomeItem
              key={row.key}
              mark={<ServiceMark label={row.title}>{agentMark(row.driver)}</ServiceMark>}
              title={row.title}
              description={row.description ?? undefined}
              status={
                row.statusLabel ? <StatusLabel status="ready" label={row.statusLabel} /> : undefined
              }
            />
          );
        }

        const dispatched = dispatchWelcomeAgentAction(row.action, {
          onInstall,
          onSignIn,
          onOpenProviderSetup,
        });
        const label =
          row.action.kind === "openProviderSetup" &&
          row.state !== "install" &&
          row.state !== "missing"
            ? "Sign in"
            : (dispatched?.label ?? "Open");

        return (
          <WelcomeItem
            key={row.key}
            mark={<ServiceMark label={row.title}>{agentMark(row.driver)}</ServiceMark>}
            title={row.title}
            description={
              row.description ?? (row.action.kind === "disabled" ? row.action.reason : undefined)
            }
            status={
              row.action.kind === "disabled" ? (
                <StatusLabel status="locked" label="Unavailable" />
              ) : undefined
            }
            action={
              dispatched ? (
                <SecondaryAction onClick={dispatched.run}>{label}</SecondaryAction>
              ) : undefined
            }
          />
        );
      })}
    </>
  );
}
