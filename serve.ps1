# Minimal local HTTP server for the LO10 presentation.
# Avoids file:// CORS issues with Babel-standalone fetching .jsx files.
# Usage:  powershell -ExecutionPolicy Bypass -File .\serve.ps1
#         then open http://localhost:8080/

param(
  [int]$Port = 8080,
  [string]$Root = (Get-Location).Path
)

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ("Failed to start on " + $prefix + " - is the port in use? Try: powershell -File .\serve.ps1 -Port 8090") -ForegroundColor Red
  exit 1
}

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".jsx"  = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".map"  = "application/json"
  ".txt"  = "text/plain; charset=utf-8"
}

Write-Host ""
Write-Host "  LO10 presentation server" -ForegroundColor Cyan
Write-Host ("  Serving:  " + $Root)
Write-Host ("  URL:      " + $prefix) -ForegroundColor Yellow
Write-Host "  Stop:     Ctrl+C"
Write-Host ""

try { Start-Process $prefix } catch {}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }

  $req = $ctx.Request
  $res = $ctx.Response
  $rel = $req.Url.AbsolutePath.TrimStart("/")
  if ([string]::IsNullOrEmpty($rel)) { $rel = "index.html" }
  $path = Join-Path $Root $rel

  if (Test-Path $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ct  = $mime[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $res.ContentType = $ct
    $res.ContentLength64 = $bytes.Length
    $res.StatusCode = 200
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ("  200  " + $rel)
  } else {
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - " + $rel + " not found")
    $res.StatusCode = 404
    $res.ContentType = "text/plain; charset=utf-8"
    $res.ContentLength64 = $msg.Length
    $res.OutputStream.Write($msg, 0, $msg.Length)
    Write-Host ("  404  " + $rel) -ForegroundColor DarkYellow
  }
  $res.Close()
}
