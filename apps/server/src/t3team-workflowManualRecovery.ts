/**
 * The RESULT + recovery section of the agent-orchestration manual: what `t3team.orchestration.run`
 * returns, how to read a `failed` result, and the agent's own controls over a run it launched
 * (pause / stop / resume — GHE #403). Its own module so `t3team-workflowManual.ts` stays under
 * the prefixed-file LOC ceiling; interpolated into {@link T3TEAM_WORKFLOW_MANUAL} verbatim.
 *
 * @module t3team-workflowManualRecovery
 */

export const T3TEAM_WORKFLOW_MANUAL_RESULT = `RESULT
Returns { runId, status: 'accepted'|'completed'|'suspended'|'failed', handoff: 'workflow-ui', output?, error? }.
accepted means the durable host owns the run. A successful workflow-ui handoff means end the
current host turn immediately with no follow-up assistant prose. Do not launch it again or poll
it; sleeping, user decisions, and other progress arrive through the existing orchestration UI.

On 'failed', read 'error' first:
- "Invalid inputs for workflow '<name>': ..." means the WORKFLOW is correct and YOUR launch
  arguments were wrong. Call t3team_orchestration_resume with the same runId and corrected
  'args' — never 'source', never t3team_orchestration_run again (that makes a duplicate card).
- "The agent turn failed: ..." means a STEP's provider turn died (gateway outage, timeout) and
  the host's bounded re-drives were exhausted. The source is fine. Call
  t3team_orchestration_resume with the same runId: it re-drives exactly that step.
- Any other failure is a genuine source defect: fix the source, then call
  t3team_orchestration_resume with corrected 'source' (same-prefix replay). Only run again if no
  runId is available to resume.

CONTROLLING A RUN YOU LAUNCHED
t3team_orchestration_status(runId) observes it. t3team_orchestration_pause(runId) parks a waiting
or scheduled run and keeps its continuation. t3team_orchestration_stop(runId) cancels it and
interrupts its child agents. To replace a run, STOP the old one first — never launch a second
copy beside it. Resume a paused or failed run with t3team_orchestration_resume(runId).`;
