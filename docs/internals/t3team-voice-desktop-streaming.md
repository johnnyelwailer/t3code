# Desktop voice: live transcription

The Electron app transcribes with whisper.cpp in a worker process behind the main process. While a
recording runs, the renderer taps the same microphone stream into 16 kHz PCM chunks and pushes them
over `desktop:push-voice-stream`. The pipeline lives in the main process
([stream session](../../apps/desktop/src/voice/t3team-voiceStreamSession.ts)) so every client
reads the same truth: it measures level, detects speech and silence from the audio itself
([activity gate](../../apps/desktop/src/voice/t3team-voiceActivityGate.ts)), re-transcribes the
utterance so far as partials, and settles the session's language (see Language). Results come
back on `desktop:voice-stream`. The pipeline ports the behavior of nx-activity-tracker's whisper
transcriber (energy floor, language vote, partial cadence), not its code.

A hotkey press opens a recording session and the next press closes it; the session, not the
utterance, is the unit. Silence beyond `voice.transcriber.silenceMs` after real speech commits
that utterance: the stream session cuts its audio, writes it down with a final pass in the main
process, and emits `utterance` with the text, while the recorder and the stream stay open and the
gate listens for the next one. The final never depends on the partials. The next press asks the
stream to `finish` (the stop request with `finish: true`): speech said after the last commit is
written down and returned in the reply, and every utterance still being written is awaited first,
so their events precede it. The renderer's recording of the microphone is not decoded for any of
this. `no-speech` (nothing said in 8 s) and `idle` (a minute of quiet after an utterance) are
`auto-commit` reasons that end the session; the 5-minute recording cap ends it too.

All passes share one serial chain, because the worker does one at a time. A partial never queues:
one starts only when the chain is idle, the gap after it grows with its duration, none starts once
the speaker has been quiet for 400 ms, and a partial over its latency budget ends partials for the
session. An utterance's final queues behind a running pass, which is why a slow machine shows
**Transcribing… N s**: the renderer counts from the `auto-commit` event until the `utterance`
(or `utterance-failed`) event for it, and the voice row, composer dock and floating widget all
derive that from the same events.

## Language

`voice.transcriber.language` is `auto` by default, and the Settings picker (Auto, then the codes in
`voice.transcriber.languages`) writes it. A concrete language is a hard pin: every partial and the
final pass use it and nothing votes. `auto` votes, once per session, in
[the language lock](../../apps/desktop/src/voice/t3team-voiceLanguageLock.ts). Whisper's language
detection on the first second or two of speech confuses close languages (German as Dutch), and a
wrong lock makes the final pass decode in the wrong language. So partials run with auto-detection,
only a partial that covered 3 s of speech votes, the first language to gather two votes and lead
locks, and a recording that has not agreed by 8 s locks the majority or, on a tie or a single vote,
stays on auto-detection. The lock lives in the stream session: every utterance of a session reuses it
(finals vote too, so a session of short utterances can still lock), and the next session votes again.

The main window restricts only the `media` permission, to audio from the app origin
([handler](../../apps/desktop/src/window/t3team-MainSessionPermissions.ts)). Electron grants every
permission to a session without a handler, and the app depends on that for notifications, clipboard
and display capture, so the handler must not become deny-by-default.

## Voice surfaces

One recorder per window owns the session and publishes it to a shared store
([host](../../apps/web/src/t3team/voice/t3team-VoiceSessionHost.tsx),
[model](../../apps/web/src/t3team/voice/surface/t3team-voiceUiModel.ts)); the sidebar row, the
composer dock and the floating widget only read it, so a state is defined once. The row's orb is
the record control; the old global pill is gone while the app is in the foreground. In the voice thread the composer's mic is the same control, and the recording grows out of the composer as a dock that collapses on commit; the heard text is then an ordinary message. The per-utterance `voice-state` context chip is the
model's input and renders nowhere in the timeline.

The floating widget is a window of its own, because a DOM overlay cannot exist while the app is
minimized. It is created hidden as soon as the main window publishes, and shown only once its page
has said it is ready, so Electron's empty window and loading view never appear. The main process
shows it while the publishing window is minimized, hidden or unfocused and a recording is live;
the page eases itself in and out (cross-fade between faces, height following content), and the
window is hidden only after the exit animation. It is destroyed when the main window closes. The
widget gets its state from the main window over IPC; level and partial transcript reach it on
`desktop:voice-stream` like every window.
