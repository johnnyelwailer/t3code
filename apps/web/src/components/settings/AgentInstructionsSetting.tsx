import { MAX_AGENT_INSTRUCTIONS_CHARS } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Textarea } from "../ui/textarea";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/**
 * Global "Personality / Instructions" editor (server setting
 * `agentInstructions`). Local draft so typing is cheap; the setting only
 * moves on blur (or the reset button), so a long edit is one settings write.
 */
export function AgentInstructionsInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (instructions: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <Textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Cmd/Ctrl+Enter commits from a keyboard-only flow without blurring.
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      maxLength={MAX_AGENT_INSTRUCTIONS_CHARS}
      rows={4}
      placeholder="e.g. Keep replies to a few short lines. Explain with small examples before long code."
      aria-label="Agent personality and instructions"
    />
  );
}

/**
 * One SettingsRow for the global personality/instructions override. The
 * reset button is only offered when the value differs from the default
 * (empty = built-in default personality).
 */
export function AgentInstructionsSettingRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (agentInstructions: string) => void;
}) {
  return (
    <SettingsRow
      {...searchableSetting("agent-personality")}
      title="Agent personality / instructions"
      description={
        "Global instructions for the agent's voice and style, applied to every new agent session. " +
        "Leave empty to use the built-in default personality; the agent's fixed operational rules always stay in force."
      }
      resetAction={
        value !== "" ? (
          <SettingResetButton label="agent personality" onClick={() => onChange("")} />
        ) : null
      }
      control={<AgentInstructionsInput value={value} onCommit={onChange} />}
    />
  );
}
