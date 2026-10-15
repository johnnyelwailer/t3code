# t3team-transcribe (Windows): native speech-to-text helper for the Nexi Work desktop app.
#
# Built into Windows, nothing to download, runs on the inbox Windows PowerShell 5.1:
#   - windows-winrt: Windows.Media.SpeechRecognition dictation (best quality; needs the
#     "Online speech recognition" privacy setting on).
#   - windows-sapi:  System.Speech desktop dictation (offline, always available for installed
#     recognizer languages). Used automatically when WinRT dictation is blocked by privacy settings.
# Speaks the JSON-lines protocol in apps/desktop/src/transcription/t3team-transcriptionProtocol.ts:
#   powershell -NoProfile -ExecutionPolicy Bypass -File t3team-transcribe.ps1 probe [-Locale de-CH]
#   ... listen -Locale de-CH [-Engine auto|winrt|sapi] [-File audio.wav]
# While listening, "stop" on stdin (or stdin EOF) finishes the stream and flushes the last final.
param(
  [Parameter(Position = 0)][string]$Command = "probe",
  [string]$Locale = [System.Globalization.CultureInfo]::CurrentUICulture.Name,
  [ValidateSet("auto", "winrt", "sapi")][string]$Engine = "auto",
  [string]$File = ""
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit([hashtable]$obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }
function Fail([string]$code, [string]$message) {
  Emit @{ type = "error"; code = $code; message = $message }
  Emit @{ type = "end" }
  exit 2
}

Add-Type -AssemblyName System.Speech
function Get-SapiLocales { @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { $_.Culture.Name }) }
function Find-SapiRecognizer([string]$loc) {
  $all = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  $exact = $all | Where-Object { $_.Culture.Name -eq $loc } | Select-Object -First 1
  if ($exact) { return $exact }
  $lang = $loc.Split("-")[0]
  return $all | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $lang } | Select-Object -First 1
}

$script:winrtLoaded = $false
function Initialize-WinRT {
  if ($script:winrtLoaded) { return $true }
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
    $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 }
    $script:asTaskOp = $methods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $script:asTaskAction = $methods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq "IAsyncAction" } | Select-Object -First 1
    $script:winrtLoaded = $true
  } catch { return $false }
  return $true
}
function Await-Op($op, [type]$resultType) {
  $task = $script:asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($op))
  $null = $task.Wait(-1); return $task.Result
}
function Await-Action($action) { $task = $script:asTaskAction.Invoke($null, @($action)); $null = $task.Wait(-1) }
function Get-WinRTLocales {
  if (-not (Initialize-WinRT)) { return @() }
  @([Windows.Media.SpeechRecognition.SpeechRecognizer]::SupportedTopicLanguages | ForEach-Object { $_.LanguageTag })
}
function Test-OnlineSpeech {
  try { return ((Get-ItemProperty -Path "HKCU:\Software\Microsoft\Speech_OneCore\Settings\OnlineSpeechPrivacy" -Name HasAccepted -ErrorAction Stop).HasAccepted -eq 1) } catch { return $false }
}

if ($Command -eq "probe") {
  $winrt = @(Get-WinRTLocales); $sapi = @(Get-SapiLocales); $online = Test-OnlineSpeech
  $picked = if ($winrt.Count -gt 0 -and $online) { "windows-winrt" } elseif ($sapi.Count -gt 0) { "windows-sapi" } else { "none" }
  Emit @{ type = "probe"; engine = $picked; available = ($picked -ne "none"); onDevice = ($picked -eq "windows-sapi");
    authorization = "authorized"; onlineSpeechEnabled = $online; locale = $Locale; locales = @($winrt + $sapi | Select-Object -Unique) }
  exit 0
}
if ($Command -ne "listen") { Fail "usage" "unknown command $Command" }

# stdin watcher: "stop" or EOF. Console.In.ReadLineAsync blocks on .NET Framework, so read the raw
# stream asynchronously instead.
$script:stdin = [Console]::OpenStandardInput()
$script:stdinBuf = New-Object byte[] 256
$script:stdinText = ""
$script:stdinTask = $script:stdin.ReadAsync($script:stdinBuf, 0, 256)
function Test-StopRequested {
  while ($script:stdinTask.IsCompleted) {
    if ($script:stdinTask.IsFaulted) { return $true }
    $n = $script:stdinTask.Result
    if ($n -le 0) { return $true }
    $script:stdinText += [System.Text.Encoding]::UTF8.GetString($script:stdinBuf, 0, $n)
    if ($script:stdinText -match "stop") { return $true }
    $script:stdinTask = $script:stdin.ReadAsync($script:stdinBuf, 0, 256)
  }
  return $false
}

function Invoke-WinRT {
  if (-not (Initialize-WinRT)) { return "unavailable" }
  try {
    # Exact tag first, then a supported dictation language of the same language (de-CH -> de-DE).
    $tags = @(Get-WinRTLocales)
    $tag = $tags | Where-Object { $_ -eq $Locale } | Select-Object -First 1
    if (-not $tag) { $tag = $tags | Where-Object { $_.Split("-")[0] -eq $Locale.Split("-")[0] } | Select-Object -First 1 }
    if (-not $tag) { return "unsupported-locale" }
    $script:Locale = $tag
    $lang = [Windows.Globalization.Language]::new($tag)
    $rec = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new($lang)
  } catch { return "unsupported-locale" }
  # No explicit constraint: an empty constraint list means the predefined dictation grammar
  # (PowerShell 5.1 cannot call Add on the projected IVector). PowerShell also cannot subscribe to
  # WinRT events, so instead of ContinuousRecognitionSession this loops RecognizeAsync per utterance.
  $resultType = [Windows.Media.SpeechRecognition.SpeechRecognitionResult]
  try {
    $compiled = Await-Op ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
    if ($compiled.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) { return "compile-$($compiled.Status)" }
    $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(30)
    $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
    $task = $script:asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($rec.RecognizeAsync()))
  } catch {
    $hr = $_.Exception.InnerException.HResult; if ($null -eq $hr) { $hr = $_.Exception.HResult }
    if ($hr -eq -2147199735) { return "online-speech-disabled" }   # 0x80045509 speech privacy policy not accepted
    if ($hr -eq -2147024891) { return "permission-denied" }        # 0x80070005 microphone access denied
    return "failed: $($_.Exception.Message)"
  }
  Emit @{ type = "ready"; engine = "windows-winrt"; locale = $Locale; onDevice = $false }
  $stopping = $false
  while ($true) {
    try { $null = $task.Wait(200) } catch { }
    if ($task.IsFaulted) {
      $hr = $task.Exception.InnerException.HResult
      if ($hr -eq -2147199735) { return "online-speech-disabled" }   # 0x80045509 speech privacy policy not accepted
      if ($hr -eq -2147024891) { return "permission-denied" }        # 0x80070005 microphone access denied
      if ($stopping) { return "done" }
      return "failed: $($task.Exception.InnerException.Message)"
    } elseif ($task.IsCompleted) {
      $res = $task.Result
      if ($res -and $res.Text) { Emit @{ type = "final"; text = $res.Text } }
      if ($stopping) { return "done" }
      try { $task = $script:asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($rec.RecognizeAsync())) } catch { return "done" }
    }
    if (-not $stopping -and (Test-StopRequested)) {
      $stopping = $true
      try { $null = $rec.StopRecognitionAsync() } catch { return "done" }
    }
  }
}

function Invoke-Sapi {
  $info = Find-SapiRecognizer $Locale
  if (-not $info) { Fail "unsupported-locale" "No Windows speech recognizer is installed for $Locale. Add the language's speech pack in Settings > Time & language > Speech." }
  $eng = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $eng.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  try {
    if ($File) { $eng.SetInputToWaveFile($File) } else { $eng.SetInputToDefaultAudioDevice() }
  } catch { Fail "no-microphone" "No microphone input is available: $($_.Exception.Message)" }
  $null = Register-ObjectEvent -InputObject $eng -EventName SpeechRecognized -SourceIdentifier t3final
  $null = Register-ObjectEvent -InputObject $eng -EventName SpeechHypothesized -SourceIdentifier t3partial
  $null = Register-ObjectEvent -InputObject $eng -EventName RecognizeCompleted -SourceIdentifier t3done
  $null = Register-ObjectEvent -InputObject $eng -EventName AudioLevelUpdated -SourceIdentifier t3level
  $eng.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Emit @{ type = "ready"; engine = "windows-sapi"; locale = $info.Culture.Name; onDevice = $true }
  $stopping = $false
  while ($true) {
    $ev = Wait-Event -Timeout 0.2
    if ($ev) {
      switch ($ev.SourceIdentifier) {
        "t3partial" { Emit @{ type = "partial"; text = $ev.SourceEventArgs.Result.Text } }
        "t3final" { $t = $ev.SourceEventArgs.Result.Text; if ($t) { Emit @{ type = "final"; text = $t } } }
        "t3level" { Emit @{ type = "level"; level = [double]$ev.SourceEventArgs.AudioLevel / 100 } }
        "t3done" { Remove-Event -EventIdentifier $ev.EventIdentifier; return }
      }
      Remove-Event -EventIdentifier $ev.EventIdentifier
    }
    if (-not $stopping -and (Test-StopRequested)) { $stopping = $true; $eng.RecognizeAsyncStop() }
  }
}

$useWinrt = ($Engine -eq "winrt") -or ($Engine -eq "auto" -and -not $File)
if ($useWinrt) {
  $outcome = Invoke-WinRT
  if ($outcome -eq "done") { Emit @{ type = "end" }; exit 0 }
  if ($outcome -eq "permission-denied") { Fail "permission-denied" "Microphone access is off. Turn on Settings > Privacy & security > Microphone > Let desktop apps access your microphone." }
  if ($Engine -eq "winrt") { Fail "unavailable" "Windows dictation unavailable: $outcome" }
  $msg = if ($outcome -eq "online-speech-disabled") { "Online speech recognition is off (Settings > Privacy & security > Speech); using offline Windows dictation." } else { "Windows dictation unavailable ($outcome); using offline Windows dictation." }
  Emit @{ type = "warning"; code = $outcome; message = $msg }
  Get-EventSubscriber | Unregister-Event; Get-Event | Remove-Event
}
Invoke-Sapi
Emit @{ type = "end" }
exit 0
