# Local preview server for GUNR.DEV — run:  powershell -ExecutionPolicy Bypass -File .\serve.ps1
# then open http://localhost:8787/   (Ctrl+C to stop)
param([int]$Port = 8787)
$Root = $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.mjs'='text/javascript';
  '.svg'='image/svg+xml'; '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.md'='text/plain';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.webp'='image/webp'; '.mp4'='video/mp4'; '.webm'='video/webm'; '.vcf'='text/vcard' }
$l = [System.Net.HttpListener]::new(); $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
Write-Host "Serving $Root at http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
  if ($p -eq '' -or $p.EndsWith('/')) { $p += 'index.html' }
  $f = [IO.Path]::GetFullPath((Join-Path $Root $p))
  if ($f.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $f -PathType Leaf)) {
    $b = [IO.File]::ReadAllBytes($f); $ct = $types[[IO.Path]::GetExtension($f).ToLower()]; if ($ct) { $c.Response.ContentType = $ct }
  } else { $c.Response.StatusCode = 404; $b = [IO.File]::ReadAllBytes((Join-Path $Root '404.html')); $c.Response.ContentType = 'text/html; charset=utf-8' }
  $c.Response.Headers.Add('Cache-Control', 'no-store')
  $c.Response.OutputStream.Write($b, 0, $b.Length); $c.Response.Close()
}
