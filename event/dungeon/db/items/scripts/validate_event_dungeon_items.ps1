param(
    [string]$Root = "event/dungeon/db/items"
)

$itemCatalogDir = Join-Path $Root "item_catalog"
$registryPath = Join-Path $Root "effects/registry.json"

if (-not (Test-Path $itemCatalogDir)) {
    throw "Missing item catalog directory: $itemCatalogDir"
}

if (-not (Test-Path $registryPath)) {
    throw "Missing effect registry: $registryPath"
}

$definitions = Get-ChildItem -Path $itemCatalogDir -Filter *.json | ForEach-Object {
    $json = Get-Content -Raw -Encoding UTF8 $_.FullName | ConvertFrom-Json
    [pscustomobject]@{
        file = $_.Name
        code = [string]$json.code
        effect = [string]$json.effect
        grant_phase = [string]$json.grant_phase
        collect_phase = [string]$json.collect_phase
        use_phase = [string]$json.use_phase
        settlement_phase = [string]$json.settlement_phase
    }
}

$registry = Get-Content -Raw -Encoding UTF8 $registryPath | ConvertFrom-Json
$grantedEffects = @($registry.granted_item_effects)
$passiveEffects = @($registry.passive_modifier_effects)
$useEffects = @($registry.use_item_effects)
$settlementEscapeEffects = @($registry.settlement_escape_effects)
$settlementDeathEffects = @($registry.settlement_death_effects)
$allImplemented = $grantedEffects + $passiveEffects + $useEffects + $settlementEscapeEffects + $settlementDeathEffects

$issues = @()

$duplicateCodes = $definitions | Group-Object code | Where-Object { $_.Name -and $_.Count -gt 1 }
foreach ($group in $duplicateCodes) {
    $issues += "duplicate code: $($group.Name)"
}

$missingCodes = $definitions | Where-Object { -not $_.code }
foreach ($item in $missingCodes) {
    $issues += "missing code in $($item.file)"
}

$missingEffects = $definitions | Where-Object { -not $_.effect }
foreach ($item in $missingEffects) {
    $issues += "missing effect in $($item.file)"
}

foreach ($item in $definitions) {
    if ($item.grant_phase -eq 'granted_item' -and $item.effect -notin $grantedEffects) {
        $issues += "grant phase effect '$($item.effect)' in $($item.file) is not registered"
    }
    if ($item.collect_phase -eq 'passive_modifiers' -and $item.effect -notin $passiveEffects) {
        $issues += "collect phase effect '$($item.effect)' in $($item.file) is not registered"
    }
    if ($item.use_phase -eq 'use_item' -and $item.effect -notin $useEffects) {
        $issues += "use phase effect '$($item.effect)' in $($item.file) is not registered"
    }
    if ($item.settlement_phase -eq 'settlement_escape' -and $item.effect -notin $settlementEscapeEffects) {
        $issues += "escape settlement effect '$($item.effect)' in $($item.file) is not registered"
    }
    if ($item.settlement_phase -eq 'settlement_death' -and $item.effect -notin $settlementDeathEffects -and $item.effect -notin $passiveEffects) {
        $issues += "death settlement effect '$($item.effect)' in $($item.file) is not registered"
    }
    if (-not $item.grant_phase -and -not $item.collect_phase -and -not $item.use_phase -and -not $item.settlement_phase) {
        $issues += "no runtime phase declared in $($item.file)"
    }
    if ($item.effect -and $item.effect -notin $allImplemented) {
        $issues += "unimplemented effect '$($item.effect)' in $($item.file)"
    }
}

$registryMaps = @{
    granted_item_effects = $grantedEffects
    passive_modifier_effects = $passiveEffects
    use_item_effects = $useEffects
    settlement_escape_effects = $settlementEscapeEffects
    settlement_death_effects = $settlementDeathEffects
}
foreach ($phaseName in $registryMaps.Keys) {
    $duplicates = $registryMaps[$phaseName] | Group-Object | Where-Object { $_.Count -gt 1 }
    foreach ($group in $duplicates) {
        $issues += "duplicate registry entry in ${phaseName}: $($group.Name)"
    }
}

if ($issues.Count -gt 0) {
    $issues | ForEach-Object { Write-Error $_ }
    throw "Item validation failed with $($issues.Count) issue(s)."
}

Write-Output "Item validation passed: $($definitions.Count) item definition file(s), $($allImplemented.Count) phase registration(s)."