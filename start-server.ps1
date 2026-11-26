param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  StrukKu PWA Server Berjalan!" -ForegroundColor Green
Write-Host "  Buka di browser: http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "  Tekan Ctrl+C untuk berhenti." -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 3000
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) { continue }
      # Drain remaining request headers
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      $parts = $requestLine.Split(' ')
      $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
      $cleanPath = ($rawPath -split '\?')[0]
      $relPath = [System.Uri]::UnescapeDataString($cleanPath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }

      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $relPath))
      if ($fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $fullPath -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $ctype = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
        $body = [System.IO.File]::ReadAllBytes($fullPath)
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
        $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($hBytes, 0, $hBytes.Length)
        $stream.Write($body, 0, $body.Length)
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($hBytes, 0, $hBytes.Length)
        $stream.Write($body, 0, $body.Length)
      }
      $stream.Flush()
    } catch {
      # Ignore individual client disconnects
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
