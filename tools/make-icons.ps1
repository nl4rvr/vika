Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$Path, [double]$Inset = 0.0)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [int]($Size * $Inset)
  $rect = New-Object System.Drawing.Rectangle($pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad))
  $radius = [int]($rect.Width * 0.24)

  $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $bgPath.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $bgPath.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $bgPath.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $bgPath.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $bgPath.CloseFigure()

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 255, 247, 241),
    [System.Drawing.Color]::FromArgb(255, 246, 226, 219),
    45.0)
  $g.FillPath($bgBrush, $bgPath)

  $cx = [double]($rect.X + $rect.Width / 2.0)
  $cy = [double]($rect.Y + $rect.Height * 0.5)
  $r  = [double]($rect.Width * 0.315)
  $w  = [double][Math]::Max(2.0, $rect.Width * 0.032)

  # мягкая дорожка кольца
  $trackPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 47, 42, 46), [float]$w)
  $g.DrawEllipse($trackPen, [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))

  # градиентная дуга
  $arcRect = New-Object System.Drawing.Rectangle([int]($cx - $r), [int]($cy - $r), [int]($r * 2), [int]($r * 2))
  $arcBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $arcRect,
    [System.Drawing.Color]::FromArgb(255, 224, 145, 125),
    [System.Drawing.Color]::FromArgb(255, 172, 132, 180),
    25.0)
  $arcPen = New-Object System.Drawing.Pen($arcBrush, [float]$w)
  $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawArc($arcPen, [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2), 105, 300)

  # полумесяц: круг минус смещённый круг
  $moonR = [double]($r * 0.60)
  $moonCx = [double]($cx - $r * 0.06)
  $moonCy = [double]$cy
  $moonRect = New-Object System.Drawing.RectangleF([float]($moonCx - $moonR), [float]($moonCy - $moonR), [float]($moonR * 2), [float]($moonR * 2))
  $moonPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $moonPath.AddEllipse($moonRect)

  $cutR = [double]($moonR * 0.94)
  $cutCx = [double]($moonCx + $moonR * 0.62)
  $cutCy = [double]($moonCy - $moonR * 0.30)
  $cutPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cutPath.AddEllipse([float]($cutCx - $cutR), [float]($cutCy - $cutR), [float]($cutR * 2), [float]($cutR * 2))

  $region = New-Object System.Drawing.Region($moonPath)
  $region.Exclude($cutPath)

  $moonRectI = New-Object System.Drawing.Rectangle([int]($moonCx - $moonR), [int]($moonCy - $moonR), [int]($moonR * 2), [int]($moonR * 2))
  $moonBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $moonRectI,
    [System.Drawing.Color]::FromArgb(240, 228, 148, 128),
    [System.Drawing.Color]::FromArgb(240, 178, 134, 182),
    70.0)
  $g.FillRegion($moonBrush, $region)

  # капля в центре полумесяца
  $dw = [double]($r * 0.30)
  $dh = [double]($r * 0.44)
  $dcx = [double]($moonCx - $r * 0.10)
  $dcy = [double]($moonCy + $r * 0.03)
  $rd = [double]($dw / 2.0)
  $apexY = [double]($dcy - $dh * 0.62)
  $baseY = [double]($dcy + $dh * 0.18)

  $dropPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $dropPath.StartFigure()
  $dropPath.AddBezier(
    [float]$dcx, [float]$apexY,
    [float]($dcx - $rd * 0.45), [float]($dcy - $dh * 0.16),
    [float]($dcx - $rd), [float]($baseY - $rd * 0.55),
    [float]($dcx - $rd), [float]$baseY)
  $dropPath.AddArc([float]($dcx - $rd), [float]($baseY - $rd), [float]($dw), [float]($dw), 180, 180)
  $dropPath.AddBezier(
    [float]($dcx + $rd), [float]$baseY,
    [float]($dcx + $rd), [float]($baseY - $rd * 0.55),
    [float]($dcx + $rd * 0.45), [float]($dcy - $dh * 0.16),
    [float]$dcx, [float]$apexY)
  $dropPath.CloseFigure()

  $dropRect = New-Object System.Drawing.Rectangle([int]($dcx - $rd), [int]$apexY, [int]($dw), [int]($dh + $rd))
  $dropBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $dropRect,
    [System.Drawing.Color]::FromArgb(255, 226, 143, 128),
    [System.Drawing.Color]::FromArgb(255, 199, 96, 78),
    90.0)
  $g.FillPath($dropBrush, $dropPath)

  # акценты
  $dotBrush1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(170, 142, 124, 180))
  $dotBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 201, 168, 124))
  $dotR1 = [float]($rect.Width * 0.022)
  $dotR2 = [float]($rect.Width * 0.014)
  $g.FillEllipse($dotBrush1, [float]($cx + $r * 0.80), [float]($cy + $r * 0.60), $dotR1 * 2, $dotR1 * 2)
  $g.FillEllipse($dotBrush2, [float]($cx - $r * 0.98), [float]($cy - $r * 0.80), $dotR2 * 2, $dotR2 * 2)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $Path ($Size px)"
}

$dir = Join-Path $PSScriptRoot 'icons'
New-Icon -Size 192 -Path (Join-Path $dir 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $dir 'icon-512.png')
New-Icon -Size 512 -Path (Join-Path $dir 'icon-maskable-512.png') -Inset 0.10
New-Icon -Size 180 -Path (Join-Path $dir 'apple-touch-icon.png')
New-Icon -Size 32  -Path (Join-Path $dir 'favicon-32.png')
