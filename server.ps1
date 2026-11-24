# ==============================================================================
# CloudAttend - Local Static HTTP Development Server
# Built for Windows PowerShell (Zero External Dependencies Required)
# ==============================================================================

$port = 3000
$rootPath = $PSScriptRoot
if (-not $rootPath) { $rootPath = Get-Location }

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Failed to start server on $prefix. Error: $_"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CloudAttend Local Development Server Running! " -ForegroundColor Green
Write-Host " URL: http://localhost:$port" -ForegroundColor Yellow
Write-Host " Serving Files From: $rootPath" -ForegroundColor Gray
Write-Host " Press Ctrl+C in terminal to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($urlPath -eq "/" -or [string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "/index.html"
        }

        # Convert URL path to relative file path
        $relativePath = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $targetFile = Join-Path $rootPath $relativePath

        # If requested path has no extension and a matching .html file exists, use it
        if (-not (Test-Path $targetFile -PathType Leaf) -and (Test-Path "$targetFile.html" -PathType Leaf)) {
            $targetFile = "$targetFile.html"
        }

        if (Test-Path $targetFile -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($targetFile).ToLower()
            $mime = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $mime = $mimeTypes[$ext]
            }

            try {
                $bytes = [System.IO.File]::ReadAllBytes($targetFile)
                $response.ContentType = $mime
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.AddHeader("Access-Control-Allow-Origin", "*")
                $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "[200 OK] $urlPath ($mime)" -ForegroundColor Green
            } catch {
                $response.StatusCode = 500
                Write-Host "[500 Error] $urlPath - $_" -ForegroundColor Red
            }
        } else {
            $response.StatusCode = 404
            $notFoundHtml = "<html><body><h1>404 Not Found</h1><p>The file '$urlPath' was not found on this server.</p></body></html>"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($notFoundHtml)
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "[404 Not Found] $urlPath" -ForegroundColor Yellow
        }

        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped." -ForegroundColor Red
}
