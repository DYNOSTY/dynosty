param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$target = [IO.Path]::GetFullPath($Destination)
$stage = Join-Path ([IO.Path]::GetTempPath()) ('Dynosty-build-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $stage | Out-Null
Push-Location $repo
try {
  pnpm build
  if ($LASTEXITCODE) { throw 'Game build failed' }
  Copy-Item apps/web/dist (Join-Path $stage 'game') -Recurse
  node --input-type=module -e "import {createInitialState} from './packages/game-core/dist/index.js'; import fs from 'node:fs'; fs.writeFileSync(process.argv[1],JSON.stringify(createInitialState()));" (Join-Path $stage 'game/initial.json')
  if ($LASTEXITCODE) { throw 'Initial state export failed' }
  $exe = Join-Path $stage 'Dynosty.exe'
  $configPath = "$stage.json"
  @{main=(Join-Path $PSScriptRoot 'launcher.cjs');output=$exe;disableExperimentalSEAWarning=$true} | ConvertTo-Json | Set-Content -Encoding utf8NoBOM $configPath
  node --build-sea=$configPath
  if ($LASTEXITCODE) { throw 'Launcher build failed' }
  Copy-Item (Join-Path $PSScriptRoot 'Node-LICENSE.txt') $stage
  Copy-Item (Join-Path $PSScriptRoot '실행 안내.txt') $stage
  New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($target)) | Out-Null
  tar -a -cf $target -C $stage .
  if ($LASTEXITCODE) { throw 'Archive failed' }
  Write-Output $target
} finally { Pop-Location }
