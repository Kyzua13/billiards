param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl
)

$ErrorActionPreference = "Stop"

if ($RepoUrl -notmatch "^https://github\.com/.+/.+\.git$") {
  Write-Host "RepoUrl must look like https://github.com/YOUR_LOGIN/billiards.git" -ForegroundColor Red
  exit 1
}

$existing = ""
$remoteList = git remote
if ($remoteList -contains "origin") {
  $existing = git remote get-url origin
  git remote set-url origin $RepoUrl
} else {
  git remote add origin $RepoUrl
}

git branch -M main
git push -u origin main

Write-Host ""
Write-Host "Done. Open Render and connect this GitHub repository:" -ForegroundColor Green
Write-Host "https://render.com"
