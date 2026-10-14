// t3team-transcribe (macOS): native speech-to-text helper for the Nexi Work desktop app.
//
// Uses Apple's built-in Speech framework (SFSpeechRecognizer) — nothing to download. Prefers
// on-device recognition when the locale supports it. Speaks the JSON-lines protocol documented in
// apps/desktop/src/transcription/t3team-transcriptionProtocol.ts:
//   t3team-transcribe probe [--locale de-CH]
//   t3team-transcribe listen --locale de-CH [--file audio.aiff]
// While listening, "stop" on stdin (or stdin EOF) finishes the stream and flushes the last final.
// Build: swiftc -O -framework Speech -framework AVFoundation t3team-transcribe.swift -o t3team-transcribe
import AVFoundation
import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
    let line = String(data: data, encoding: .utf8)
  else { return }
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func fail(_ code: String, _ message: String) -> Never {
  emit(["type": "error", "code": code, "message": message])
  emit(["type": "end"])
  exit(code == "permission-denied" ? 3 : 2)
}

func authName(_ s: SFSpeechRecognizerAuthorizationStatus) -> String {
  switch s {
  case .authorized: return "authorized"
  case .denied: return "denied"
  case .restricted: return "restricted"
  case .notDetermined: return "not-determined"
  @unknown default: return "unknown"
  }
}

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "probe"
func flag(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  return args[i + 1]
}
let localeId = flag("--locale") ?? Locale.current.identifier
let filePath = flag("--file")

/// Exact locale first, then another supported locale of the same language (e.g. de-LI -> de-CH).
func makeRecognizer() -> SFSpeechRecognizer? {
  let wanted = Locale(identifier: localeId)
  let supported = SFSpeechRecognizer.supportedLocales()
  let norm = { (id: String) in id.replacingOccurrences(of: "_", with: "-").lowercased() }
  if supported.contains(where: { norm($0.identifier) == norm(localeId) }) {
    return SFSpeechRecognizer(locale: wanted)
  }
  let lang = norm(localeId).split(separator: "-").first.map(String.init) ?? ""
  if let alt = supported.first(where: { norm($0.identifier).hasPrefix(lang + "-") }) {
    return SFSpeechRecognizer(locale: alt)
  }
  return nil
}

let dictationOffMessage =
  "Dictation is turned off. Turn it on in System Settings → Keyboard → Dictation to use voice input."

/// macOS needs Siri or Dictation enabled for SFSpeechRecognizer (else kLSRErrorDomain 201).
func dictationEnabled() -> Bool? {
  let domain = "com.apple.assistant.support" as CFString
  let dictation = CFPreferencesCopyAppValue("Dictation Enabled" as CFString, domain) as? Bool
  let assistant = CFPreferencesCopyAppValue("Assistant Enabled" as CFString, domain) as? Bool
  if dictation == nil && assistant == nil { return nil }
  return (dictation ?? false) || (assistant ?? false)
}

if command == "probe" {
  let recognizer = makeRecognizer()
  let locales = SFSpeechRecognizer.supportedLocales().map { $0.identifier.replacingOccurrences(of: "_", with: "-") }.sorted()
  emit([
    "type": "probe",
    "engine": "macos-speech",
    "available": recognizer?.isAvailable ?? false,
    "onDevice": recognizer?.supportsOnDeviceRecognition ?? false,
    "authorization": authName(SFSpeechRecognizer.authorizationStatus()),
    "dictationEnabled": dictationEnabled() ?? NSNull(),
    "reason": dictationEnabled() == false ? dictationOffMessage : "",
    "locale": localeId,
    "locales": locales,
  ])
  exit(0)
}

guard command == "listen" else { fail("usage", "unknown command \(command)") }

// Permission: speech recognition (the mic prompt comes from AVAudioEngine below).
let authSem = DispatchSemaphore(value: 0)
var authStatus = SFSpeechRecognizer.authorizationStatus()
if authStatus == .notDetermined {
  SFSpeechRecognizer.requestAuthorization { s in
    authStatus = s
    authSem.signal()
  }
  authSem.wait()
}
guard authStatus == .authorized else {
  fail("permission-denied", "Speech recognition permission is \(authName(authStatus)). Allow it in System Settings → Privacy & Security → Speech Recognition.")
}
guard let recognizer = makeRecognizer() else { fail("unsupported-locale", "No speech recognizer for \(localeId).") }
guard recognizer.isAvailable else { fail("unavailable", "Speech recognition is currently unavailable for \(localeId).") }
var onDevice = recognizer.supportsOnDeviceRecognition && !args.contains("--server")

/// One recognition segment. Segments rotate after a pause so finals stream while the user talks.
final class Segment {
  let request = SFSpeechAudioBufferRecognitionRequest()
  var task: SFSpeechRecognitionTask?
  var lastText = ""
  var lastChange = Date()
  let started = Date()
  var finished = false
  var ended = false
}

let lock = NSLock()
var current: Segment?
var pending = 0  // segments whose final result is still outstanding
var stopping = false

func finishIfDone() {
  if stopping && pending == 0 {
    emit(["type": "end"])
    exit(0)
  }
}

func startSegment() -> Segment {
  let seg = Segment()
  seg.request.shouldReportPartialResults = true
  if onDevice { seg.request.requiresOnDeviceRecognition = true }
  if #available(macOS 13.0, *) { seg.request.addsPunctuation = true }
  pending += 1
  seg.task = recognizer.recognitionTask(with: seg.request) { result, error in
    lock.lock()
    defer { lock.unlock() }
    if let result = result {
      let text = result.bestTranscription.formattedString
      if result.isFinal {
        if !seg.finished {
          seg.finished = true
          pending -= 1
          if !text.isEmpty { emit(["type": "final", "text": text]) }
          finishIfDone()
        }
        return
      }
      if text != seg.lastText {
        seg.lastText = text
        seg.lastChange = Date()
        emit(["type": "partial", "text": text])
      }
    }
    if let error = error, !seg.finished {
      seg.finished = true
      pending -= 1
      // "No speech detected" (1110) and cancellations are benign; flush what we have.
      let ns = error as NSError
      if ns.domain == "kLSRErrorDomain" && ns.code == 201 {
        // macOS refuses speech recognition entirely while Dictation is turned off.
        emit(["type": "error", "code": "unavailable", "message": dictationOffMessage])
        emit(["type": "end"])
        exit(2)
      }
      if !seg.lastText.isEmpty { emit(["type": "final", "text": seg.lastText]) }
      else if ns.code != 1110 && ns.code != 216 && ns.code != 301 {
        emit(["type": "warning", "code": "segment-error", "message": "\(ns.domain) \(ns.code): \(ns.localizedDescription)"])
      }
      finishIfDone()
    }
  }
  return seg
}

func endSegment(_ seg: Segment) {
  if seg.ended { return }
  seg.ended = true
  seg.request.endAudio()
}

func stopAll() {
  lock.lock()
  defer { lock.unlock() }
  if stopping { return }
  stopping = true
  if let seg = current { endSegment(seg) }
  current = nil
  finishIfDone()
}

lock.lock()
current = startSegment()
lock.unlock()

if let filePath = filePath {
  // File mode (smoke tests): feed the whole file, then finish.
  let url = URL(fileURLWithPath: filePath)
  guard let file = try? AVAudioFile(forReading: url) else { fail("failed", "Cannot read \(filePath)") }
  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
  do { try file.read(into: buffer) } catch { fail("failed", "Cannot decode \(filePath)") }
  emit(["type": "ready", "engine": "macos-speech", "locale": localeId, "onDevice": onDevice])
  current?.request.append(buffer)
  stopAll()
} else {
  let engine = AVAudioEngine()
  let input = engine.inputNode
  let format = input.outputFormat(forBus: 0)
  guard format.sampleRate > 0 && format.channelCount > 0 else {
    fail("no-microphone", "No microphone input is available (or microphone access was denied).")
  }
  input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
    lock.lock()
    let seg = current
    lock.unlock()
    seg?.request.append(buffer)
    // Input level (RMS → 0..1) for hosts that want a native waveform.
    if let ch = buffer.floatChannelData?[0] {
      var sum: Float = 0
      let n = Int(buffer.frameLength)
      for i in 0..<n { sum += ch[i] * ch[i] }
      let rms = n > 0 ? sqrt(sum / Float(n)) : 0
      emit(["type": "level", "level": min(1, Double(rms) * 8)])
    }
  }
  engine.prepare()
  do { try engine.start() } catch {
    fail("permission-denied", "Microphone could not be started (\(error.localizedDescription)). Allow microphone access in System Settings → Privacy & Security → Microphone.")
  }
  emit(["type": "ready", "engine": "macos-speech", "locale": localeId, "onDevice": onDevice])

  // Rotate the segment after a 1.2 s pause in partial results so finals arrive while talking,
  // and well before the ~1 min server-side request limit.
  Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
    lock.lock()
    defer { lock.unlock() }
    guard !stopping, let seg = current else { return }
    let idle = Date().timeIntervalSince(seg.lastChange)
    let age = Date().timeIntervalSince(seg.started)
    if (!seg.lastText.isEmpty && idle > 1.2) || (!onDevice && age > 50) {
      endSegment(seg)
      current = startSegment()
    }
  }

  // stdin: "stop" or EOF finishes.
  DispatchQueue.global().async {
    while let line = readLine() {
      if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
    }
    engine.stop()
    input.removeTap(onBus: 0)
    stopAll()
  }
}

// Safety net: never hang after stop if the recognizer never delivers a final.
DispatchQueue.global().async {
  while true {
    Thread.sleep(forTimeInterval: 0.5)
    lock.lock()
    let s = stopping
    lock.unlock()
    if s {
      Thread.sleep(forTimeInterval: 4)
      emit(["type": "end"])
      exit(0)
    }
  }
}
RunLoop.main.run()
