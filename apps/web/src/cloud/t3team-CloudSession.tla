
------------------------------ MODULE CloudSession ------------------------------
(*****************************************************************************)
(* Faithful model of the Nexi Work cloud-session lifecycle as of             *)
(* johnnyelwailer/t3code origin/main d7babd984d (hive/nx-nexi pin #1308,     *)
(* 41fc3dd, 2026-11-11). UI surfaces are independently derived, matching     *)
(* ChatView.tsx and the hooks named in comments.                             *)
(*                                                                           *)
(* ApplyFix = FALSE  — current code (invariants about a single visible       *)
(*                     status are expected to fail; traces map to Phil's     *)
(*                     08:27 and 08:32 screenshots).                         *)
(* ApplyFix = TRUE   — proposed single-status reducer; TLC should pass.      *)
(*                                                                           *)
(* File:line references are against origin/main d7babd984d.                  *)
(*****************************************************************************)

EXTENDS Naturals, FiniteSets, TLC

CONSTANT ApplyFix

\* packages/contracts/src/t3team-cloudSession.ts:40-49
\* "creating" is the client's optimistic sentinel (CLOUD_SESSION_CREATING_ID)
\* before the create RPC answers (t3team-cloudSessionTargetLogic.ts).
SessionPhase == {
  "none", "creating", "requested", "queued",
  "preparing", "starting", "ready",
  "failed", "stopped", "cancelled"
}
Provisioning == {"creating", "requested", "queued", "preparing", "starting"}
Terminal    == {"failed", "stopped", "cancelled"}

\* Coarse connection supervisor (client-runtime connection model +
\* t3team-environmentLiveState.ts:32-39). "blocked" is parked on
\* session_ended (t3team-brokerConnection.ts:69-70).
Conn == {"live", "connecting", "offline", "blocked"}

Queued      == {"none", "waiting", "failed", "sending"}
FailureKind == {"none", "project_not_resolved", "session_ended", "other"}
Dialog      == {"none", "gh_signin", "add_project"}

VARIABLES
  phase,              \* newest session's CloudSession.phase (or creating/none)
  endedSticky,        \* thread env parked on session_ended (sessionEndedAtom)
  conn,               \* supervisor presentation for the THREAD's environment
  machineConnected,   \* client is connected to the NEWEST session's machine
  projectReady,       \* draft project listed on that machine
  providerReady,      \* composer-selected provider installed + signed in
  queued,             \* persisted first-message record (t3team-cloudQueuedSendModel.ts)
  failureKind,        \* queued.failureKind when queued = "failed"
  startingAnother,    \* create in flight or new session still provisioning
  cloneSuggested,     \* module-level suggestion store (t3team-cloudProjectCloneSuggestion.ts)
  network,
  signedIn,
  dialog,
  dialogFromUser,     \* TRUE only when a user click opened the dialog
  modelSwitched,      \* TRUE if the composer selection changed without a user choice
  dispatchAttempts,   \* startTurn calls for this messageId
  serverGotTurn,      \* server accepted commandId cloud-queued-send:<id>
  recordCleared,      \* completeCloudQueuedSend ran (or user cancelled)
  dispatching,        \* in-window set (lost on app restart)
  cycles              \* session-end/restart bound

vars == <<
  phase, endedSticky, conn, machineConnected, projectReady, providerReady,
  queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
  dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
  recordCleared, dispatching, cycles
>>

-------------------------------------------------------------------------------
\* Derived UI — CURRENT code computes each surface independently.
\* Setup card: t3team-useCloudSessionSetupCard.ts:119-157
\*   Hidden only when there is no session id, or (no queued message AND
\*   session is stopped/cancelled). A queued message keeps the card up
\*   even on a terminal session (line 121-123).
\* Ended banner: t3team-CloudSessionEndedBanner.tsx:85-97
\*   Only keys on useEnvironmentSessionEnded(threadEnv). It is concatenated
\*   with other banners in ChatView.tsx:1384-1391 / 2843-2861, and is NOT
\*   suppressed while a setup card is on screen.
\* Clone banner: t3team-useCloudProjectCloneBanner.tsx:16-46,
\*   pushed in ChatView.tsx:2843-2861 next to the ended banner.
\* Offline banner: useSystemComposerBanners.tsx:201; replaced by the ended
\*   banner via withCloudSessionEndedBanner (EndedBanner.tsx:116-125).

SetupCard ==
  IF queued = "none" /\ phase \in Terminal \union {"none"}
  THEN "hidden"
  ELSE IF queued = "none" /\ ~(phase \in Provisioning)
  THEN "hidden"
  ELSE IF queued = "failed"
        \/ (queued = "waiting" /\ phase \in Terminal)
        \/ (queued = "waiting" /\ endedSticky /\ phase \notin Provisioning \union {"ready"})
  THEN "failed"
  ELSE IF phase = "ready" /\ queued = "none"
  THEN "ready"
  ELSE IF queued \in {"waiting", "sending"} \/ phase \in Provisioning
  THEN "working"
  ELSE "hidden"

\* "Setting up" in the invariant sense: the card is on screen claiming the
\* session is being set up or is still setting up (08:27 title "Still setting
\* up" is stage=failed AND keptWaiting, t3team-cloudSessionSetupModel.ts:124-132).
SettingUpShown == SetupCard \in {"working", "failed", "ready"}

EndedBannerCurrent == endedSticky
EndedBannerFixed   == endedSticky /\ ~SettingUpShown /\ ~startingAnother
EndedBanner        == IF ApplyFix THEN EndedBannerFixed ELSE EndedBannerCurrent

\* The clone banner is a second status about the same setup. The 08:32 shot
\* shows it after Connect is done (machineConnected) while the project list
\* is still pending — consistent with useAddProjectTargets requiring a
\* connected machine (useCloudProjectCloneBanner.tsx:23-26).
CloneBannerCurrent == cloneSuggested /\ machineConnected /\ ~projectReady
CloneBannerFixed   == FALSE   \* folded into the setup card; not a second banner
CloneBanner        == IF ApplyFix THEN CloneBannerFixed ELSE CloneBannerCurrent

OfflineBannerCurrent ==
  conn \in {"connecting", "offline"} /\ ~EndedBanner
\* Proposed: suppress machine banners while a setup card is already saying
\* what is happening (Phil: banners only when actionable; none while starting).
OfflineBannerFixed ==
  conn \in {"connecting", "offline"} /\ ~EndedBanner /\ ~SettingUpShown
OfflineBanner == IF ApplyFix THEN OfflineBannerFixed ELSE OfflineBannerCurrent

VisibleStatuses ==
  (IF SettingUpShown THEN {"setup"} ELSE {}) \union
  (IF EndedBanner    THEN {"ended"} ELSE {}) \union
  (IF CloneBanner    THEN {"clone"} ELSE {}) \union
  (IF OfflineBanner  THEN {"offline"} ELSE {})

\* Primary forward actions visible to the user (for the "way forward" property).
\* t3team-CloudSessionSetupActions.tsx:51-65, t3team-endedSessionAction.ts:17-33.
RetryOrTryAgain ==
  \/ queued = "failed"
  \/ (SettingUpShown /\ endedSticky)   \* Try again / Start another
  \/ (EndedBanner /\ ~startingAnother)

CancelEnabled == queued \in {"waiting", "failed"}

SystemCanProgress ==
  \/ phase \in Provisioning
  \/ (queued = "waiting" /\ phase = "ready" /\ (~machineConnected \/ ~projectReady \/ ~providerReady))
  \/ (queued = "sending")
  \/ (conn = "connecting" /\ network)
  \/ (~signedIn)          \* user can sign in
  \/ (~network)           \* network can return
  \/ (dialog /= "none")   \* user can dismiss / finish

HasForward ==
  \/ ~SettingUpShown /\ ~EndedBanner /\ queued = "none"
  \/ RetryOrTryAgain
  \/ CancelEnabled
  \/ SystemCanProgress
  \/ (EndedBanner /\ ~startingAnother)  \* "Start another cloud session"

-------------------------------------------------------------------------------
\* Invariants (the properties Phil asked for)

TypeOK ==
  /\ phase \in SessionPhase
  /\ endedSticky \in BOOLEAN
  /\ conn \in Conn
  /\ machineConnected \in BOOLEAN
  /\ projectReady \in BOOLEAN
  /\ providerReady \in BOOLEAN
  /\ queued \in Queued
  /\ failureKind \in FailureKind
  /\ startingAnother \in BOOLEAN
  /\ cloneSuggested \in BOOLEAN
  /\ network \in BOOLEAN
  /\ signedIn \in BOOLEAN
  /\ dialog \in Dialog
  /\ dialogFromUser \in BOOLEAN
  /\ modelSwitched \in BOOLEAN
  /\ dispatchAttempts \in 0..3
  /\ serverGotTurn \in BOOLEAN
  /\ recordCleared \in BOOLEAN
  /\ dispatching \in BOOLEAN
  /\ cycles \in 0..2

\* Exactly one visible cloud-session status per thread. Zero is allowed when
\* the session is idle/ready and there is nothing to say.
InvExactlyOneStatus == Cardinality(VisibleStatuses) <= 1

\* ended and setting-up never shown together (08:27 and 08:32).
InvNoEndedAndSettingUp == ~(EndedBanner /\ SettingUpShown)

\* A queued message is never sent twice: the server keys on
\* commandId = cloud-queued-send:<messageId> (t3team-cloudQueuedSendDispatch.ts:2-5, 37-38).
\* dispatchAttempts may exceed 1 after a crash; serverGotTurn stays a single acceptance.
InvMessageAtMostOnce ==
  /\ dispatchAttempts <= 3
  /\ (serverGotTurn => dispatchAttempts >= 1)

\* Not lost: the record stays until send completes or the user cancels.
\* App restart while phase = "creating" parks a retryable failure (flush.ts:75-79),
\* which is a kept message, not a loss.
InvMessageNotLost ==
  \/ recordCleared
  \/ queued \in {"waiting", "failed", "sending"}
  \/ (queued = "none" /\ ~serverGotTurn /\ dispatchAttempts = 0)

\* No dialog without a user action (#1283; CloudSessionSignInDialogHost.tsx:57-66, 82
\* opens when a failure handler sets the request — not from a click).
InvNoAutoDialog == (dialog /= "none") => dialogFromUser

\* The user's provider and model are never switched silently (#1283).
InvNoSilentProviderSwitch == ~modelSwitched

\* Every non-terminal visible state has a way forward.
InvNonTerminalHasForward == HasForward

\* Phil's 08:32 screenshot: setup card working ("Connecting to the cloud
\* machine") + ended banner + "is not on Cloud session" clone banner.
InvPhil0832 == ~(SetupCard = "working" /\ EndedBanner /\ CloneBanner)

\* 08:27: kept-waiting / failed card + ended banner (title "Still setting up").
InvPhil0827 == ~(SetupCard = "failed" /\ EndedBanner)

\* Under ApplyFix, at most one primary button: Retry or Try again on the
\* setup card, or Start another on the ended banner, or Reconnect on the
\* offline banner — never two at once (08:27 had Try again and Start another).
sessionLooksDead ==
  \/ phase \in Terminal
  \/ (endedSticky /\ ~startingAnother /\ phase \notin Provisioning \union {"ready"})

PrimaryActions ==
  LET
    retry == IF SetupCard = "failed" /\ ~sessionLooksDead THEN {"retry"} ELSE {}
    tryAgain == IF SetupCard = "failed" /\ sessionLooksDead THEN {"try_again"} ELSE {}
    startAnother == IF EndedBanner /\ ~startingAnother THEN {"start_another"} ELSE {}
    reconnect == IF OfflineBanner /\ conn = "offline" THEN {"reconnect"} ELSE {}
  IN retry \union tryAgain \union startAnother \union reconnect

InvExactlyOnePrimaryForward == Cardinality(PrimaryActions) <= 1


-------------------------------------------------------------------------------
\* Actions — client, server, broker and machine interleave.

Init ==
  /\ phase = "none"
  /\ endedSticky = FALSE
  /\ conn = "live"
  /\ machineConnected = FALSE
  /\ projectReady = FALSE
  /\ providerReady = FALSE
  /\ queued = "none"
  /\ failureKind = "none"
  /\ startingAnother = FALSE
  /\ cloneSuggested = FALSE
  /\ network = TRUE
  /\ signedIn = TRUE
  /\ dialog = "none"
  /\ dialogFromUser = FALSE
  /\ modelSwitched = FALSE
  /\ dispatchAttempts = 0
  /\ serverGotTurn = FALSE
  /\ recordCleared = FALSE
  /\ dispatching = FALSE
  /\ cycles = 0

\* User sends a first message and starts (or restarts) a cloud session.
\* Optimistic: the card appears at once (t3team-cloudSessionTargetStore beginCloudSessionCreate,
\* ChatView gate). "Start another" / "Try again" also takes this path
\* (useCloudSessionSetupCard.ts:78-93, CloudSessionEndedActions.tsx:85)
\* and rebinds a parked message (resumeParkedSendOnSession) WITHOUT clearing
\* endedSticky — the thread is still on the old environment.
UserStartSession ==
  /\ signedIn
  /\ network
  /\ dialog = "none"
  /\ queued \in {"none", "failed"}
  /\ ~recordCleared \/ queued = "failed"
  /\ dispatchAttempts = 0 \/ queued = "failed"
  /\ phase \in {"none"} \union Terminal \/ endedSticky
  /\ cycles < 2
  /\ phase' = "creating"
  /\ queued' = "waiting"
  /\ failureKind' = "none"
  /\ startingAnother' = TRUE
  /\ machineConnected' = FALSE
  /\ projectReady' = FALSE
  /\ providerReady' = FALSE
  /\ recordCleared' = FALSE
  /\ dispatching' = FALSE
  /\ serverGotTurn' = FALSE
  /\ dispatchAttempts' = 0
  /\ cloneSuggested' = FALSE
  /\ cycles' = cycles + 1
  /\ UNCHANGED <<endedSticky, conn, network, signedIn, dialog, dialogFromUser, modelSwitched>>

\* Create RPC fails because GitHub is not signed in: the failure handler
\* opens CloudSessionSignInDialogHost automatically (t3team-cloudSessionFailure.ts
\* → requestCloudSessionSignIn; Dialog open={request !== null}, line 82).
CreateNeedsGitHubSignIn ==
  /\ ~ApplyFix
  /\ phase = "creating"
  /\ dialog = "none"
  /\ dialog' = "gh_signin"
  /\ dialogFromUser' = FALSE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
       modelSwitched, dispatchAttempts, serverGotTurn, recordCleared,
       dispatching, cycles
     >>

UserDismissDialog ==
  /\ dialog /= "none"
  /\ dialog' = "none"
  /\ dialogFromUser' = FALSE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
       modelSwitched, dispatchAttempts, serverGotTurn, recordCleared,
       dispatching, cycles
     >>

UserOpensAddToMachine ==
  /\ CloneBannerCurrent
  /\ dialog = "none"
  /\ dialog' = "add_project"
  /\ dialogFromUser' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
       modelSwitched, dispatchAttempts, serverGotTurn, recordCleared,
       dispatching, cycles
     >>

\* Server accepts the create and the workflow marches
\* (apps/server/src/cloud/t3team-cloudSessionPhase.ts:79-126).
ServerAcceptCreate ==
  /\ phase = "creating"
  /\ dialog = "none"
  /\ phase' = "requested"
  /\ UNCHANGED <<
       endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

ServerFail ==
  /\ phase \in Provisioning
  /\ phase' = "failed"
  /\ startingAnother' = FALSE
  /\ queued' = IF queued = "waiting" THEN "failed" ELSE queued
  /\ failureKind' = IF queued = "waiting" THEN "other" ELSE failureKind
  /\ UNCHANGED <<
       endedSticky, conn, machineConnected, projectReady, providerReady,
       cloneSuggested, network, signedIn, dialog, dialogFromUser,
       modelSwitched, dispatchAttempts, serverGotTurn, recordCleared,
       dispatching, cycles
     >>

\* Hold ends, idle release, or user stop (phase.ts:88-91, 103-107).
\* Parks the THREAD environment on session_ended (brokerConnection.ts:55-70).
SessionEnd ==
  /\ phase = "ready"
  /\ phase' = "stopped"
  /\ endedSticky' = TRUE
  /\ conn' = "blocked"
  /\ machineConnected' = FALSE
  /\ startingAnother' = FALSE
  /\ UNCHANGED <<
       projectReady, providerReady, queued, failureKind, cloneSuggested,
       network, signedIn, dialog, dialogFromUser, modelSwitched,
       dispatchAttempts, serverGotTurn, recordCleared, dispatching, cycles
     >>

UserCancelSession ==
  /\ phase \in Provisioning \union {"ready"}
  /\ phase' = "cancelled"
  /\ startingAnother' = FALSE
  /\ UNCHANGED <<
       endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* Broker has minted the environment id and the client connects
\* (flush.ts:110-116, NexiBrokerService attach). This is the NEW session's
\* machine. The thread may still be on the OLD ended environment, so
\* endedSticky is left as-is (ChatView environmentId vs session.environmentId).
ClientConnect ==
  /\ phase = "ready"
  /\ network
  /\ signedIn
  /\ ~machineConnected
  /\ machineConnected' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, projectReady, providerReady, queued,
       failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* Project follow: the composer's project is not on the machine yet
\* (t3team-useCloudSessionProjectFollow.ts:105-110).
SuggestClone ==
  /\ queued \in {"waiting", "failed"}
  /\ machineConnected
  /\ ~projectReady
  /\ ~cloneSuggested
  /\ cloneSuggested' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* "Project ready" wait expires (CLOUD_PROJECT_WAIT_BOUND_SECONDS = 180,
\* t3team-cloudProjectWaitBound.ts:22; flush.ts:120-127). Message is KEPT.
ProjectWaitExpires ==
  /\ queued = "waiting"
  /\ phase = "ready"
  /\ machineConnected
  /\ ~projectReady
  /\ queued' = "failed"
  /\ failureKind' = "project_not_resolved"
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       startingAnother, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* Flush parks a waiting send when the session is terminal or the attach
\* reports session_ended (flush.ts:94-104).
FlushSeesEnded ==
  /\ queued = "waiting"
  /\ endedSticky
  /\ phase \in Terminal \/ (~machineConnected /\ phase /= "ready")
  /\ queued' = "failed"
  /\ failureKind' = "session_ended"
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       startingAnother, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

ProjectAppears ==
  /\ machineConnected
  /\ ~projectReady
  /\ projectReady' = TRUE
  /\ cloneSuggested' = FALSE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, providerReady, queued,
       failureKind, startingAnother, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

ProviderBecomesReady ==
  /\ machineConnected
  /\ projectReady
  /\ ~providerReady
  /\ providerReady' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, queued,
       failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* Flusher dispatches exactly once under the in-window set + cross-window claim
\* (dispatch.ts:110-155, claim.ts:18-27).
FlushDispatch ==
  /\ queued = "waiting"
  /\ phase = "ready"
  /\ machineConnected
  /\ projectReady
  /\ providerReady
  /\ ~dispatching
  /\ dispatchAttempts < 3
  /\ queued' = "sending"
  /\ dispatching' = TRUE
  /\ dispatchAttempts' = dispatchAttempts + 1
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, serverGotTurn, recordCleared,
       cycles
     >>

\* Server accepts (or returns the first receipt on commandId replay).
ServerAcceptTurn ==
  /\ queued = "sending"
  /\ dispatching
  /\ serverGotTurn' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, recordCleared,
       dispatching, cycles
     >>

\* completeCloudQueuedSend (dispatch.ts:94-101, 150). Promoting the draft
\* rebinds the thread onto the new environment, which finally clears endedSticky.
CompleteSend ==
  /\ queued = "sending"
  /\ serverGotTurn
  /\ queued' = "none"
  /\ recordCleared' = TRUE
  /\ dispatching' = FALSE
  /\ endedSticky' = FALSE
  /\ startingAnother' = FALSE
  /\ conn' = "live"
  /\ cloneSuggested' = FALSE
  /\ UNCHANGED <<
       phase, machineConnected, projectReady, providerReady, failureKind,
       network, signedIn, dialog, dialogFromUser, modelSwitched,
       dispatchAttempts, serverGotTurn, cycles
     >>

\* Crash after startTurn succeeded but before complete: in-memory dispatching
\* is lost; the persisted record remains; claim expires (45 s, claim.ts:5).
\* A later FlushDispatch retries; commandId replay prevents a second message.
CrashMidDispatch ==
  /\ queued = "sending"
  /\ dispatching
  /\ dispatching' = FALSE
  /\ queued' = IF serverGotTurn THEN "waiting" ELSE "waiting"
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       failureKind, startingAnother, cloneSuggested, network, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, cycles
     >>

UserCancelMessage ==
  /\ queued \in {"waiting", "failed"}
  /\ ~dispatching
  /\ queued' = "none"
  /\ recordCleared' = TRUE
  /\ failureKind' = "none"
  /\ cloneSuggested' = FALSE
  /\ startingAnother' = FALSE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       network, signedIn, dialog, dialogFromUser, modelSwitched,
       dispatchAttempts, serverGotTurn, dispatching, cycles
     >>

\* cloudSetupRecovery: retry if the session is not dead. "Try again"
\* on a dead session is UserStartSession. A live session just clears the failure.
UserRetry ==
  /\ queued = "failed"
  /\ failureKind /= "none"
  /\ phase = "ready"
  /\ ~endedSticky \/ machineConnected
  /\ queued' = "waiting"
  /\ failureKind' = "none"
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       startingAnother, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

NetworkDrop ==
  /\ network
  /\ network' = FALSE
  /\ machineConnected' = FALSE
  /\ conn' = IF endedSticky THEN "blocked" ELSE "offline"
  /\ UNCHANGED <<
       phase, endedSticky, projectReady, providerReady, queued, failureKind,
       startingAnother, cloneSuggested, signedIn, dialog, dialogFromUser,
       modelSwitched, dispatchAttempts, serverGotTurn, recordCleared,
       dispatching, cycles
     >>

NetworkReconnect ==
  /\ ~network
  /\ network' = TRUE
  /\ conn' = IF endedSticky THEN "blocked" ELSE "connecting"
  /\ UNCHANGED <<
       phase, endedSticky, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, signedIn,
       dialog, dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

FinishReconnect ==
  /\ network
  /\ conn = "connecting"
  /\ ~endedSticky
  /\ phase = "ready"
  /\ conn' = "live"
  /\ machineConnected' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, projectReady, providerReady, queued, failureKind,
       startingAnother, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

AppRestart ==
  /\ dispatching' = FALSE
  /\ dialog' = "none"
  /\ dialogFromUser' = FALSE
  /\ startingAnother' = FALSE
  \* Reload during "creating" loses the in-memory create answer (flush.ts:75-79).
  /\ queued' = IF queued = "waiting" /\ phase = "creating"
               THEN "failed"
               ELSE IF queued = "sending" THEN "waiting" ELSE queued
  /\ failureKind' = IF queued = "waiting" /\ phase = "creating"
                    THEN "other"
                    ELSE failureKind
  /\ phase' = IF phase = "creating" THEN "none" ELSE phase
  /\ UNCHANGED <<
       endedSticky, conn, machineConnected, projectReady, providerReady,
       cloneSuggested, network, signedIn, modelSwitched, dispatchAttempts,
       serverGotTurn, recordCleared, cycles
     >>

SignOut ==
  /\ signedIn
  /\ signedIn' = FALSE
  /\ machineConnected' = FALSE
  /\ dialog' = "none"
  /\ dialogFromUser' = FALSE
  /\ UNCHANGED <<
       phase, endedSticky, conn, projectReady, providerReady, queued,
       failureKind, startingAnother, cloneSuggested, network, modelSwitched,
       dispatchAttempts, serverGotTurn, recordCleared, dispatching, cycles
     >>

SignIn ==
  /\ ~signedIn
  /\ signedIn' = TRUE
  /\ UNCHANGED <<
       phase, endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, startingAnother, cloneSuggested, network, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

\* Idle done-state so TLC does not report deadlock once the message is sent
\* or cancelled and nothing else is in flight.
Done ==
  /\ recordCleared
  /\ queued = "none"
  /\ dialog = "none"
  /\ ~dispatching
  /\ UNCHANGED vars

-------------------------------------------------------------------------------
\* The provision-advance action, written so UNCHANGED is a plain tuple.
ServerAdvanceProvisioning ==
  /\ \/ /\ phase = "requested" /\ phase' = "queued"
        /\ UNCHANGED startingAnother
     \/ /\ phase = "queued"    /\ phase' = "preparing"
        /\ UNCHANGED startingAnother
     \/ /\ phase = "preparing"  /\ phase' = "starting"
        /\ UNCHANGED startingAnother
     \/ /\ phase = "starting"   /\ phase' = "ready"
        /\ UNCHANGED startingAnother
  /\ UNCHANGED <<
       endedSticky, conn, machineConnected, projectReady, providerReady,
       queued, failureKind, cloneSuggested, network, signedIn, dialog,
       dialogFromUser, modelSwitched, dispatchAttempts, serverGotTurn,
       recordCleared, dispatching, cycles
     >>

Next ==
  \/ UserStartSession
  \/ CreateNeedsGitHubSignIn
  \/ UserDismissDialog
  \/ UserOpensAddToMachine
  \/ ServerAcceptCreate
  \/ ServerAdvanceProvisioning
  \/ ServerFail
  \/ SessionEnd
  \/ UserCancelSession
  \/ ClientConnect
  \/ SuggestClone
  \/ ProjectWaitExpires
  \/ FlushSeesEnded
  \/ ProjectAppears
  \/ ProviderBecomesReady
  \/ FlushDispatch
  \/ ServerAcceptTurn
  \/ CompleteSend
  \/ CrashMidDispatch
  \/ UserCancelMessage
  \/ UserRetry
  \/ NetworkDrop
  \/ NetworkReconnect
  \/ FinishReconnect
  \/ AppRestart
  \/ SignOut
  \/ SignIn
  \/ Done

Spec == Init /\ [][Next]_vars

-------------------------------------------------------------------------------
\* Readable trace fields for TLC's ALIAS.

Alias == [
  phase |-> phase,
  queued |-> queued,
  failureKind |-> failureKind,
  endedSticky |-> endedSticky,
  startingAnother |-> startingAnother,
  machineConnected |-> machineConnected,
  projectReady |-> projectReady,
  providerReady |-> providerReady,
  cloneSuggested |-> cloneSuggested,
  setupCard |-> SetupCard,
  endedBanner |-> EndedBanner,
  cloneBanner |-> CloneBanner,
  offlineBanner |-> OfflineBanner,
  visible |-> VisibleStatuses,
  dialog |-> dialog,
  dialogFromUser |-> dialogFromUser,
  dispatchAttempts |-> dispatchAttempts,
  serverGotTurn |-> serverGotTurn,
  recordCleared |-> recordCleared,
  applyFix |-> ApplyFix,
  conn |-> conn,
  primaryActions |-> PrimaryActions
]

=============================================================================
