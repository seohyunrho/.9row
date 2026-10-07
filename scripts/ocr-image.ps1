param([Parameter(Mandatory = $true)][string]$ImagePath)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$result = $null
$stream = $null
$bitmap = $null
$phase = 'unavailable'

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapBounds, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

    $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
        $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    if ($null -eq $script:asTask) { throw 'unavailable' }
    function Await-WinRt($Operation, [Type]$ResultType) {
        $task = $script:asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        $task.Wait()
        return $task.Result
    }

    $phase = 'language'
    $language = [Windows.Globalization.Language]::new('ko-KR')
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
    if ($null -eq $engine) { throw 'language' }

    $phase = 'decode'
    $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync([IO.Path]::GetFullPath($ImagePath))) ([Windows.Storage.StorageFile])
    $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $width = [int]$decoder.PixelWidth
    $height = [int]$decoder.PixelHeight
    $maximum = [int][Windows.Media.Ocr.OcrEngine]::MaxImageDimension

    $phase = 'dimensions'
    if ($width -lt 1 -or $height -lt 1 -or $width -gt $maximum -or $height -gt 60000 -or ([long]$width * $height) -gt 80000000) { throw 'dimensions' }
    # Keep source resolution and coordinates; isolate text at actual table column boundaries.
    $scale = 1
    $tileHeight = [int][Math]::Min(3000, [Math]::Min([Math]::Floor($maximum / $scale), [Math]::Floor(20000000 / ($width * $scale * $scale))))
    $overlap = [int][Math]::Min(220, [Math]::Floor($tileHeight / 4))
    $step = $tileHeight - $overlap
    $tileCount = 1
    if ($height -gt $tileHeight) { $tileCount += [int][Math]::Ceiling(($height - $tileHeight) / [double]$step) }
    if ($tileCount -gt 24 -or $step -lt 1) { throw 'dimensions' }
    $rows = New-Object 'System.Collections.Generic.List[object]'
    Add-Type -Path (Join-Path $PSScriptRoot 'ocr-table-grid.cs') -ReferencedAssemblies System.Drawing
    $rules = @([OcrTableGrid]::Read($ImagePath) | ForEach-Object {
        [ordered]@{ x = $_[0]; y = $_[1]; width = $_[2]; height = $_[3] }
    })

    for ($tile = 0; $tile -lt $tileCount; $tile++) {
        $top = $tile * $step
        $localHeight = [int][Math]::Min($tileHeight, $height - $top)
        $bounds = New-Object Windows.Graphics.Imaging.BitmapBounds
        $bounds.X = 0
        $bounds.Y = [uint32]($top * $scale)
        $bounds.Width = [uint32]($width * $scale)
        $bounds.Height = [uint32]($localHeight * $scale)
        $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
        $transform.ScaledWidth = [uint32]($width * $scale)
        $transform.ScaledHeight = [uint32]($height * $scale)
        $transform.Bounds = $bounds
        $phase = 'decode'
        $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync(
            [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
            [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
            $transform,
            [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
            [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage
        )) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $phase = 'recognize'
            $recognized = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            foreach ($line in $recognized.Lines) {
                $groups = New-Object 'System.Collections.Generic.List[object]'
                $group = New-Object 'System.Collections.Generic.List[object]'
                $previousWord = $null
                foreach ($word in ($line.Words | Sort-Object { $_.BoundingRect.X })) {
                    if ($null -ne $previousWord) {
                        $gapLeft = ($previousWord.BoundingRect.X + $previousWord.BoundingRect.Width) / $scale
                        $gapRight = $word.BoundingRect.X / $scale
                        $wordY = $top + ($word.BoundingRect.Y + $word.BoundingRect.Height / 2) / $scale
                        $separator = @($rules | Where-Object { $_.width -le 3 -and $_.x -ge $gapLeft -and $_.x -le $gapRight -and $_.y -le $wordY -and ($_.y + $_.height) -ge $wordY })
                        if ($separator.Count -gt 0) { $groups.Add($group.ToArray()); $group = New-Object 'System.Collections.Generic.List[object]' }
                    }
                    $group.Add($word)
                    $previousWord = $word
                }
                if ($group.Count -gt 0) { $groups.Add($group.ToArray()) }
                foreach ($words in $groups) {
                $text = if ($groups.Count -eq 1) { $line.Text.Trim() } else { (($words | ForEach-Object { $_.Text }) -join ' ').Trim() }
                if ([string]::IsNullOrWhiteSpace($text)) { continue }
                $minimumY = [double]::PositiveInfinity
                $maximumY = [double]::NegativeInfinity
                $minimumX = [double]::PositiveInfinity
                $maximumX = [double]::NegativeInfinity
                foreach ($word in $words) {
                    $minimumY = [Math]::Min($minimumY, $word.BoundingRect.Y)
                    $maximumY = [Math]::Max($maximumY, $word.BoundingRect.Y + $word.BoundingRect.Height)
                    $minimumX = [Math]::Min($minimumX, $word.BoundingRect.X)
                    $maximumX = [Math]::Max($maximumX, $word.BoundingRect.X + $word.BoundingRect.Width)
                }
                if ([double]::IsInfinity($minimumY)) { continue }
                if ($maximumX -le $minimumX -or $maximumY -le $minimumY) { continue }
                $minimumX /= $scale
                $maximumX /= $scale
                $minimumY /= $scale
                $maximumY /= $scale
                $center = ($minimumY + $maximumY) / 2
                # Each overlap belongs to one tile. Retain native resolution and whole lines.
                if ($tile -gt 0 -and $center -lt ($overlap / 2)) { continue }
                if ($tile -lt ($tileCount - 1) -and $center -ge ($localHeight - $overlap / 2)) { continue }
                $absoluteY = $top + $center
                $lineHeight = $maximumY - $minimumY
                $key = $text -replace '\s+', ''
                $duplicate = $false
                for ($previous = $rows.Count - 1; $previous -ge [Math]::Max(0, $rows.Count - 20); $previous--) {
                    $row = $rows[$previous]
                    if ($row.Tile -ne $tile -and $row.Key -eq $key -and [Math]::Abs($row.Y - $absoluteY) -lt ([Math]::Max($row.Height, $lineHeight) / 2)) {
                        $duplicate = $true
                        break
                    }
                }
                if (-not $duplicate) {
                    $rows.Add([pscustomobject]@{
                        Text = $text; Key = $key; Y = $absoluteY; Height = $lineHeight; Tile = $tile
                        Left = $minimumX; Top = $top + $minimumY; Width = $maximumX - $minimumX
                    })
                }
                if ($rows.Count -gt 5000) { $phase = 'output'; throw 'output' }
                }
            }
        } finally {
            if ($null -ne $bitmap) { $bitmap.Dispose(); $bitmap = $null }
        }
    }
    $text = (($rows | ForEach-Object { $_.Text }) -join "`n").Trim()
    $phase = 'empty'
    if ([string]::IsNullOrWhiteSpace($text)) { throw 'empty' }
    $phase = 'output'
    if ($text.Length -gt 250000) { throw 'output' }
    $lines = @($rows | ForEach-Object {
        [ordered]@{ text = $_.Text; x = $_.Left; y = $_.Top; width = $_.Width; height = $_.Height }
    })
    $result = @{ ok = $true; text = $text; engine = 'windows-ocr'; language = 'ko'; width = $width; height = $height; lines = $lines; rules = $rules }
} catch {
    # Avoid returning file paths, raw system exceptions, or private process details.
    $result = @{ ok = $false; code = $phase }
} finally {
    if ($null -ne $bitmap) { try { $bitmap.Dispose() } catch {} }
    if ($null -ne $stream) { try { $stream.Dispose() } catch {} }
}

[Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 5))
if (-not $result.ok) { exit 1 }
