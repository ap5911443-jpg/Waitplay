# Regression test for how WaitPlay.exe finds and keeps the browser profile (every login lives there).
# Needs a built exe (npm run build:native). Uses FAKE folders under %TEMP% only: your real profile, %LOCALAPPDATA%\WaitPlay and
# %TEMP%\waitplay are never passed to these calls.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot '..\WaitPlay.exe'
$root = Join-Path $env:TEMP ('wp-adopt-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $root | Out-Null
$asm = [Reflection.Assembly]::LoadFrom((Resolve-Path $exe).Path)
$store = $asm.GetType('WaitPlayNative.ProfileStore')
$flags = [Reflection.BindingFlags]'Static,NonPublic,Public'
$adopt = $store.GetMethod('Adopt', $flags)
$resolve = $store.GetMethod('Resolve', $flags)
$fail = 0
function Check($name, $ok, $detail = '') { if ($ok) { "PASS  $name $detail" } else { "FAIL  $name $detail"; $script:fail++ } }
function MakeProfile($dir, $tag) { New-Item -ItemType Directory -Force -Path "$dir\EBWebView\Default\Network" | Out-Null; Set-Content -Path "$dir\EBWebView\Default\Network\Cookies" -Value $tag }
function Tag($dir) { if (Test-Path "$dir\EBWebView\Default\Network\Cookies") { (Get-Content "$dir\EBWebView\Default\Network\Cookies") } else { '' } }

try {
  # 1. old profile, nothing at the destination: moved, content intact, old folder gone
  $d = "$root\t1\new\webview2"; $l = "$root\t1\old\webview2"; MakeProfile $l 'LOGIN-1'
  $r = $adopt.Invoke($null, @($d, $l))
  Check '1 old profile moves to a new destination' (($r -eq $d) -and (Tag $d) -eq 'LOGIN-1' -and -not (Test-Path $l))

  # 2. destination already has a profile: nothing is touched
  $d = "$root\t2\new\webview2"; $l = "$root\t2\old\webview2"; MakeProfile $d 'NEW'; MakeProfile $l 'OLD'
  $r = $adopt.Invoke($null, @($d, $l))
  Check '2 an existing destination profile wins and the old one is left alone' (($r -eq $d) -and (Tag $d) -eq 'NEW' -and (Tag $l) -eq 'OLD')

  # 3. empty destination folder in the way: removed, old profile moved in
  $d = "$root\t3\new\webview2"; $l = "$root\t3\old\webview2"; New-Item -ItemType Directory -Force -Path $d | Out-Null; MakeProfile $l 'LOGIN-3'
  $r = $adopt.Invoke($null, @($d, $l))
  Check '3 an empty destination folder does not block the move' (($r -eq $d) -and (Tag $d) -eq 'LOGIN-3' -and -not (Test-Path $l))

  # 4. old profile still in use (open handle inside): used in place, nothing lost, moved on the next start
  $d = "$root\t4\new\webview2"; $l = "$root\t4\old\webview2"; MakeProfile $l 'LOGIN-4'
  $fs = [IO.File]::Open("$l\EBWebView\Default\Network\Cookies", 'Open', 'Read', 'None')
  try { $r = $adopt.Invoke($null, @($d, $l)) } finally { $fs.Close() }
  Check '4 a locked old profile is used in place, not lost' (($r -eq $l) -and (Tag $l) -eq 'LOGIN-4' -and -not (Test-Path "$d\EBWebView"))
  $r = $adopt.Invoke($null, @($d, $l))
  Check '4b once unlocked, the next start moves it' (($r -eq $d) -and (Tag $d) -eq 'LOGIN-4' -and -not (Test-Path $l))

  # 5. destination holds unrelated files but no profile: left alone, no move
  $d = "$root\t5\new\webview2"; $l = "$root\t5\old\webview2"; New-Item -ItemType Directory -Force -Path $d | Out-Null; Set-Content "$d\notes.txt" 'x'; MakeProfile $l 'LOGIN-5'
  $r = $adopt.Invoke($null, @($d, $l))
  Check '5 a foreign, non-empty destination is not clobbered' ((Tag $l) -eq 'LOGIN-5' -and (Test-Path "$d\notes.txt"))

  # 6. WAITPLAY_PROFILE_DIR is used as given and never receives the old profile (the way real logins were once lost to a test)
  $fakeTemp = "$root\t6\temp"; $over = "$root\t6\override\webview2"
  MakeProfile "$fakeTemp\waitplay\webview2" 'LOGIN-6'
  $oldTemp = $env:TEMP; $oldTmp = $env:TMP; $oldOver = $env:WAITPLAY_PROFILE_DIR
  try { $env:TEMP = $fakeTemp; $env:TMP = $fakeTemp; $env:WAITPLAY_PROFILE_DIR = $over; $r = $resolve.Invoke($null, @()) }
  finally { $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:WAITPLAY_PROFILE_DIR = $oldOver }
  Check '6 an override is used as given and never receives the old profile' (($r -eq $over) -and (Test-Path $over) -and -not (Test-Path "$over\EBWebView") -and (Tag "$fakeTemp\waitplay\webview2") -eq 'LOGIN-6')
} finally {
  Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
if ($fail -eq 0) { 'ALL PASSED' } else { "$fail FAILED"; exit 1 }
