param([string]$CoreRoot = (Join-Path $PSScriptRoot '../../starsector-core'))
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$core = (Resolve-Path -LiteralPath $CoreRoot).Path
$source = Join-Path $core 'data/characters/skills'
$aptitudes = @(Import-Csv -LiteralPath (Join-Path $source 'aptitude_data.csv') | Sort-Object { [int]$_.order } | ForEach-Object {
    [ordered]@{ id = $_.id; name = $_.name; color = $_.color; description = $_.description; icon = "graphics/icons/skills/category_$($_.id).png" }
})
$skills = @(Import-Csv -LiteralPath (Join-Path $source 'skill_data.csv') | Where-Object {
    $_.id -and !$_.id.StartsWith('#') -and $_.name -and $_.tags -notmatch 'npc_only|deprecated'
} | Sort-Object { [int]$_.order } | ForEach-Object {
    $row = $_
    $spec = Get-Content -LiteralPath (Join-Path $source "$($row.id).skill") -Raw
    $spec = $spec -replace '(?m)^\s*#.*$', ''
    $aptitude = [regex]::Match($spec, '"governingAptitude"\s*:\s*"([^"\r\n]+)"').Groups[1].Value
    if ($aptitude -notin $aptitudes.id) { throw "Unknown aptitude for $($row.id)" }
    if (!(Test-Path -LiteralPath (Join-Path $project "public/game-assets/$($row.icon)"))) { throw "Unpackaged skill icon: $($row.icon)" }
    [ordered]@{
        id = $row.id; name = $row.name; aptitude = $aptitude; order = [int]$row.order; tier = [int]$row.tier
        requiredPoints = [int]$row.reqPoints; extraSkillPoints = [int]$row.reqPointsPerExtraSkill
        quote = $row.description; author = $row.author; icon = $row.icon
        scope = [regex]::Match($spec, '"scope"\s*:\s*"?([A-Z_]+)').Groups[1].Value
        scopeLabel = [regex]::Match($spec, '"scopeStr"\s*:\s*"([^"\r\n]+)"').Groups[1].Value
        source = "data/characters/skills/$($row.id).skill"
    }
})
if ($skills.Count -ne 40) { throw "Expected 40 current player skills, found $($skills.Count); review source changes before regenerating." }
[ordered]@{ source = 'data/characters/skills/{skill_data.csv,aptitude_data.csv,*.skill}'; aptitudes = $aptitudes; skills = $skills } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $project 'src/studio/native-skill-tree.json') -Encoding utf8
Write-Output "Imported $($skills.Count) current skills in $($aptitudes.Count) aptitudes. Metadata only; execution support comes from CombatSkills.ts."
