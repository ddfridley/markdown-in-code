param(
    [Parameter(Mandatory = $true)][string]$CodePath,
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [int]$Port = 9333
)

$ErrorActionPreference = 'Stop'
$ProjectPath = [System.IO.Path]::GetFullPath($ProjectPath)
$endpoint = "http://127.0.0.1:$Port/json/list"
$statePath = Join-Path $ProjectPath '.vscode/debug-host.json'
try {
    $existingTarget = Invoke-RestMethod -Uri $endpoint -TimeoutSec 1
} catch {
    $existingTarget = $null
}
if ($existingTarget) {
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $matchingTarget = $existingTarget | Where-Object { $_.id -eq $state.targetId }
        if ($matchingTarget -and [System.IO.Path]::GetFullPath($state.projectPath) -eq $ProjectPath -and $state.port -eq $Port) {
            Write-Output "Reusing this project's running extension inspector on 127.0.0.1:$Port. Reload the development window to load a rebuilt extension."
            exit 0
        }
    }
    throw "Debug port $Port is already in use. Close the previous development window before launching again."
}

# The agent/CLI may inherit this flag; the child must run as VS Code, not Node.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$launchArguments = @(
    '--new-window',
    "--inspect-extensions=$Port",
    ('--extensionDevelopmentPath="{0}"' -f $ProjectPath),
    ('"{0}"' -f (Join-Path $ProjectPath 'tests/fixtures/comments.ts'))
)
Start-Process -FilePath $CodePath -ArgumentList $launchArguments -WindowStyle Hidden

$deadline = [DateTime]::UtcNow.AddSeconds(25)
while ([DateTime]::UtcNow -lt $deadline) {
    try {
        $targets = Invoke-RestMethod -Uri $endpoint -TimeoutSec 1
        if ($targets | Where-Object { $_.webSocketDebuggerUrl }) {
            $target = $targets | Where-Object { $_.webSocketDebuggerUrl } | Select-Object -First 1
            @{ projectPath = $ProjectPath; port = $Port; targetId = $target.id } |
                ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
            Write-Output "Extension inspector is ready on 127.0.0.1:$Port."
            exit 0
        }
    } catch {
        # Poll the inspector endpoint until the new host is available.
    }
    Start-Sleep -Milliseconds 200
}
throw "The extension inspector did not become available on port $Port within 25 seconds."
