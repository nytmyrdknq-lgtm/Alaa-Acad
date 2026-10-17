$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$publishRoot = Join-Path $projectRoot "site-package"

$booksDestination = Join-Path $publishRoot "data\books"
$iconsSource = Join-Path $projectRoot "icons"
New-Item -ItemType Directory -Path $booksDestination -Force | Out-Null
New-Item -ItemType Directory -Path $iconsSource -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $publishRoot "icons") -Force | Out-Null

Add-Type -AssemblyName System.Drawing
function New-AppIcon([int]$Size, [string]$Path) {
  $sourcePath = Join-Path $iconsSource "bimo-source.png"
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "صورة الشعار الأصلية غير موجودة: $sourcePath"
  }

  $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::FromArgb(5, 9, 7))
    $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $sourceImage.Dispose()
  }
}

New-AppIcon 180 (Join-Path $iconsSource "bimo-180.png")
New-AppIcon 192 (Join-Path $iconsSource "bimo-192.png")
New-AppIcon 512 (Join-Path $iconsSource "bimo-512.png")

foreach ($file in @("index.html", "styles.css", "study.css", "subscription.css", "install.css", "app.js", "manifest.webmanifest", "service-worker.js", "_headers")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $publishRoot -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot "data\books\index.json") -Destination $booksDestination -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "data\books\verified-excerpts.json") -Destination $booksDestination -Force
foreach ($icon in @("bimo-180.png", "bimo-192.png", "bimo-512.png")) {
  Copy-Item -LiteralPath (Join-Path $iconsSource $icon) -Destination (Join-Path $publishRoot "icons") -Force
}
$unusedIcon = Join-Path $publishRoot "icons\bimo.svg"
if (Test-Path -LiteralPath $unusedIcon) {
  Remove-Item -LiteralPath $unusedIcon
}

Write-Output "اكتملت حزمة النشر: $publishRoot"
Write-Output "ارفع محتويات هذا المجلد إلى استضافة ملفات ثابتة. لم تُنسخ ملفات PDF الأصلية."
