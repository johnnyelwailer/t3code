# Desktop voice: live transcription

The Electron app transcribes with whisper.cpp in a worker process behind the main process. While a
recording runs, the renderer taps the same microphone stream into 16 kHz PCM chunks and pushes them
over `desktop:push-voice-stream`. The pipeline lives in the main process
([stream session](../../apps/desktop/src/voice/t3team-voiceStreamSession.ts)) so every client
reads the same truth: it measures level, detects speech and silence from the audio itself
([activity gate](../../apps/desktop/src/voice/t3team-voiceActivityGate.ts)), re-transcribes the
utterance so far as partials, and locks the language after the first two transcripts. Results come
back on `desktop:voice-stream`. The pipeline ports the behavior of nx-activity-tracker's whisper
transcriber (energy floor, language vote, partial cadence), not its code.

Silence beyond `voice.transcriber.silenceMs` after real speech sends `auto-commit`. The renderer
answers by stopping the recording, which runs the existing batch transcription of the whole
recording as the final pass, so the committed text never depends on the partials. The language the
stream locked is passed to that final pass. Partials never queue: one runs at a time and the gap
after it grows with its duration, so the final pass is not stuck behind a backlog on a slow machine. A partial that exceeds its
latency budget ends partials for that recording.

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
