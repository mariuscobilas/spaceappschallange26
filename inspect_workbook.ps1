param(
    [string]$Path = 'data\dryad_eash_2025\Cover_Crop_Trials_Data.xlsx',
    [int]$PreviewRows = 5,
    [switch]$Summary
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Path))
try {
    function Read-Entry([string]$name) {
        $entry = $archive.GetEntry($name)
        if (-not $entry) { return $null }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    }

    $shared = Read-Entry 'xl/sharedStrings.xml'
    $strings = @($shared.sst.si | ForEach-Object { $_.InnerText })
    $book = Read-Entry 'xl/workbook.xml'
    $sheets = @($book.workbook.sheets.sheet)
    for ($index = 1; $index -le $sheets.Count; $index++) {
        $sheet = $sheets[$index - 1]
        $xml = Read-Entry "xl/worksheets/sheet$index.xml"
        $rows = @($xml.worksheet.sheetData.row)
        Write-Output "SHEET: $($sheet.name) | rows: $($rows.Count)"
        foreach ($row in $rows | Select-Object -First $PreviewRows) {
            $cells = foreach ($cell in $row.c) {
                $value = if ($cell.t -eq 's') { $strings[[int]$cell.v] } elseif ($cell.t -eq 'inlineStr') { $cell.is.InnerText } else { $cell.v }
                if ($null -ne $value -and "$value" -ne '') { "$($cell.r)=$value" }
            }
            Write-Output ($cells -join ' | ')
        }
        if ($Summary -and $sheet.name -eq 'Field Data') {
            $dataRows = @($rows | Select-Object -Skip 1)
            foreach ($column in @('E', 'H', 'L', 'U')) {
                $values = foreach ($row in $dataRows) {
                    $cell = @($row.c | Where-Object { $_.r -match "^$column\d+$" }) | Select-Object -First 1
                    if ($null -eq $cell) { continue }
                    if ($cell.t -eq 's') { $strings[[int]$cell.v] } else { $cell.v }
                }
                $present = @($values | Where-Object { $null -ne $_ -and $_ -ne 'NA' -and $_ -ne 'NE' -and "$_" -ne '' })
                Write-Output "  $column present: $($present.Count)/$($dataRows.Count)"
                if ($column -eq 'E') { $present | Group-Object | ForEach-Object { Write-Output "    $($_.Name): $($_.Count)" } }
            }
        }
    }
} finally {
    $archive.Dispose()
}
