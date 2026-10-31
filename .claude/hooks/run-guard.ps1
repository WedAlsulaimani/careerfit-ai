# Launcher for secret-guard.mjs. Works from any hook shell (bash, cmd, PowerShell) on Windows.
# Finds Node.js even when it is missing from PATH, forwards stdin as raw bytes (no BOM/encoding changes)
# and FAILS CLOSED: if Node is missing or anything goes wrong, exit 2 so the tool call is blocked.
$ErrorActionPreference = "Stop"
try {
  $stdin = New-Object System.IO.MemoryStream
  [Console]::OpenStandardInput().CopyTo($stdin)

  $node = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $node) {
    $candidates = @(
      "$env:ProgramFiles\nodejs\node.exe",
      "${env:ProgramFiles(x86)}\nodejs\node.exe",
      "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { $node = $c; break } }
  }
  if (-not $node) {
    [Console]::Error.WriteLine("secret-guard: Node.js not found, blocking the tool call (fail closed).")
    exit 2
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = '"' + (Join-Path $PSScriptRoot "secret-guard.mjs") + '"'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $bytes = $stdin.ToArray()
  $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $proc.StandardInput.Close()
  $err = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()

  if ($proc.ExitCode -eq 0) { exit 0 }
  if ($err) { [Console]::Error.WriteLine($err.Trim()) }
  exit 2
} catch {
  [Console]::Error.WriteLine("secret-guard: launcher error ($($_.Exception.Message)), blocking (fail closed).")
  exit 2
}
