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
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::FromArgb(5, 9, 7))

    $margin = [single]($Size * 0.07)
    $stroke = [single]($Size * 0.025)
    $bounds = New-Object System.Drawing.RectangleF($margin, $margin, ($Size - 2 * $margin), ($Size - 2 * $margin))
    $radius = [single]($Size * 0.18)
    $pathShape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $pathShape.AddArc($bounds.X, $bounds.Y, $diameter, $diameter, 180, 90)
    $pathShape.AddArc(($bounds.Right - $diameter), $bounds.Y, $diameter, $diameter, 270, 90)
    $pathShape.AddArc(($bounds.Right - $diameter), ($bounds.Bottom - $diameter), $diameter, $diameter, 0, 90)
    $pathShape.AddArc($bounds.X, ($bounds.Bottom - $diameter), $diameter, $diameter, 90, 90)
    $pathShape.CloseFigure()

    $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(11, 23, 16))
    $graphics.FillPath($panelBrush, $pathShape)
    $outline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(57, 255, 136), $stroke)
    $graphics.DrawPath($outline, $pathShape)

    $font = New-Object System.Drawing.Font("Arial", [single]($Size * 0.44), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(57, 255, 136))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBounds = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $graphics.DrawString("A+", $font, $textBrush, $textBounds, $format)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $textBrush.Dispose()
    $font.Dispose()
    $outline.Dispose()
    $panelBrush.Dispose()
    $pathShape.Dispose()
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-AppIcon 180 (Join-Path $iconsSource "bimo-180.png")
New-AppIcon 192 (Join-Path $iconsSource "bimo-192.png")
New-AppIcon 512 (Join-Path $iconsSource "bimo-512.png")

foreach ($file in @("index.html", "styles.css", "subscription.css", "install.css", "app.js", "manifest.webmanifest", "service-worker.js", "_headers")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $publishRoot -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot "data\books\index.json") -Destination $booksDestination -Force
Copy-Item -LiteralPath (Join-Path $iconsSource "bimo.svg") -Destination (Join-Path $publishRoot "icons") -Force
foreach ($icon in @("bimo-180.png", "bimo-192.png", "bimo-512.png")) {
  Copy-Item -LiteralPath (Join-Path $iconsSource $icon) -Destination (Join-Path $publishRoot "icons") -Force
}

Write-Output "اكتملت حزمة النشر: $publishRoot"
Write-Output "ارفع محتويات هذا المجلد إلى استضافة ملفات ثابتة. لم تُنسخ ملفات PDF الأصلية."
