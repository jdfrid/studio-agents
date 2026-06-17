# Studio Agents - Google Cloud Storage setup via gcloud
# Run from PowerShell after installing Google Cloud CLI:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-gcs.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "studio-agents-prod"
$BucketName = "studio-agents-dev"
$ServiceAccountName = "studio-agents-runner"
$KeyPath = "C:\Users\jdfri\secrets\gcs-key.json"
$EnvPath = "C:\Users\jdfri\studio-agents\.env"

Write-Host "Checking gcloud..."
gcloud --version | Out-Host

Write-Host "Logging in to Google Cloud..."
gcloud auth login

Write-Host "Creating/selecting project: $ProjectId"
$existingProject = gcloud projects describe $ProjectId --format="value(projectId)" 2>$null
if (-not $existingProject) {
  gcloud projects create $ProjectId --name="Studio Agents Prod"
}
gcloud config set project $ProjectId

Write-Host "Enabling required APIs..."
gcloud services enable storage.googleapis.com iamcredentials.googleapis.com --project=$ProjectId

Write-Host "Creating bucket: gs://$BucketName"
$existingBucket = gcloud storage buckets describe "gs://$BucketName" --format="value(name)" 2>$null
if (-not $existingBucket) {
  gcloud storage buckets create "gs://$BucketName" --project=$ProjectId --location=us-central1 --uniform-bucket-level-access
}

$ServiceAccountEmail = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
Write-Host "Creating service account: $ServiceAccountEmail"
$existingSa = gcloud iam service-accounts describe $ServiceAccountEmail --format="value(email)" 2>$null
if (-not $existingSa) {
  gcloud iam service-accounts create $ServiceAccountName --display-name="Studio Agents Runner" --project=$ProjectId
}

Write-Host "Granting IAM roles..."
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$ServiceAccountEmail" --role="roles/storage.objectAdmin" | Out-Null
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$ServiceAccountEmail" --role="roles/iam.serviceAccountTokenCreator" | Out-Null

Write-Host "Creating key at: $KeyPath"
New-Item -ItemType Directory -Force -Path (Split-Path $KeyPath) | Out-Null
if (-not (Test-Path $KeyPath)) {
  gcloud iam service-accounts keys create $KeyPath --iam-account=$ServiceAccountEmail --project=$ProjectId
} else {
  Write-Host "Key already exists, not overwriting: $KeyPath"
}

Write-Host "Updating .env..."
$envLines = @(
  "GCS_BUCKET=$BucketName",
  "GOOGLE_APPLICATION_CREDENTIALS=$KeyPath"
)

if (-not (Test-Path $EnvPath)) {
  Copy-Item "C:\Users\jdfri\studio-agents\.env.example" $EnvPath
}

$envContent = Get-Content $EnvPath -Raw
foreach ($line in $envLines) {
  $key = $line.Split("=")[0]
  if ($envContent -match "(?m)^$key=") {
    $envContent = $envContent -replace "(?m)^$key=.*$", $line.Replace("\", "\\")
  } else {
    $envContent = $envContent.TrimEnd() + "`r`n" + $line + "`r`n"
  }
}
Set-Content -Path $EnvPath -Value $envContent -Encoding UTF8

Write-Host ""
Write-Host "Done."
Write-Host "Project: $ProjectId"
Write-Host "Bucket: gs://$BucketName"
Write-Host "Service account: $ServiceAccountEmail"
Write-Host "Key: $KeyPath"
Write-Host "Env: $EnvPath"
Write-Host ""
Write-Host "Next: make sure billing is enabled for $ProjectId, then run:"
Write-Host "  cd C:\Users\jdfri\studio-agents"
Write-Host "  pnpm infra:up"
Write-Host "  pnpm prisma:generate"
Write-Host "  pnpm prisma:migrate"
Write-Host "  pnpm prisma:seed"
# Studio Agents — GCS setup script (Windows PowerShell)
# Usage:
#   1. Edit the three variables below (PROJECT_ID, BUCKET_NAME, REGION) if needed.
#   2. Run from PowerShell:  .\scripts\setup-gcs.ps1
# What it does:
#   - Logs you into gcloud (browser opens once).
#   - Creates a GCP project if it does not exist.
#   - Enables Cloud Storage + IAM Credentials APIs.
#   - Creates the bucket with uniform-bucket-level-access.
#   - Creates a service account with Storage Object Admin and Token Creator roles.
#   - Downloads the JSON key to %USERPROFILE%\secrets\studio-agents-gcs.json.
#   - Patches your .env file (or creates one from .env.example) with the values.

$ErrorActionPreference = "Stop"

# ============== EDIT THESE THREE LINES ==============
$PROJECT_ID  = "studio-agents-prod"        # globally unique GCP project id
$BUCKET_NAME = "studio-agents-jdfri-dev"   # globally unique GCS bucket name (lowercase, no spaces)
$REGION      = "us-central1"               # or europe-west3, asia-southeast1, etc.
# ====================================================

$SA_ID       = "studio-agents-runner"
$SA_EMAIL    = "$SA_ID@$PROJECT_ID.iam.gserviceaccount.com"
$KEY_DIR     = Join-Path $env:USERPROFILE "secrets"
$KEY_PATH    = Join-Path $KEY_DIR "studio-agents-gcs.json"
$REPO_ROOT   = Split-Path -Parent $PSScriptRoot
$ENV_FILE    = Join-Path $REPO_ROOT ".env"
$ENV_EXAMPLE = Join-Path $REPO_ROOT ".env.example"

function Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }

Step "Checking gcloud installation"
$null = gcloud --version
if ($LASTEXITCODE -ne 0) {
  throw "gcloud is not installed. Install Google Cloud SDK first: https://cloud.google.com/sdk/docs/install#windows"
}

Step "Logging in to gcloud (browser will open if not already authenticated)"
gcloud auth login --update-adc | Out-Null

Step "Ensuring project '$PROJECT_ID' exists"
$exists = gcloud projects describe $PROJECT_ID --format="value(projectId)" 2>$null
if (-not $exists) {
  Write-Host "Creating project..."
  gcloud projects create $PROJECT_ID --name="Studio Agents"
}
gcloud config set project $PROJECT_ID | Out-Null

Step "REMINDER: billing must be linked to this project (one-time, in the Cloud Console)"
Write-Host "  Open https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
Write-Host "  Link any billing account, then press Enter here to continue..."
[void](Read-Host)

Step "Enabling required APIs (storage + IAM credentials)"
gcloud services enable storage.googleapis.com iamcredentials.googleapis.com --project=$PROJECT_ID

Step "Creating bucket gs://$BUCKET_NAME in $REGION (skipped if it already exists)"
gcloud storage buckets describe "gs://$BUCKET_NAME" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud storage buckets create "gs://$BUCKET_NAME" --location=$REGION --uniform-bucket-level-access --project=$PROJECT_ID
} else {
  Write-Host "Bucket already exists, skipping."
}

Step "Creating service account $SA_EMAIL (skipped if it already exists)"
gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud iam service-accounts create $SA_ID --display-name="Studio Agents Runner" --project=$PROJECT_ID
} else {
  Write-Host "Service account already exists, skipping."
}

Step "Granting Storage Object Admin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectAdmin" --condition=None --quiet | Out-Null

Step "Granting Service Account Token Creator (for V4 signed URLs)"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountTokenCreator" --condition=None --quiet | Out-Null

Step "Downloading service account key to $KEY_PATH"
if (-not (Test-Path $KEY_DIR)) { New-Item -ItemType Directory -Path $KEY_DIR | Out-Null }
if (Test-Path $KEY_PATH) {
  $backup = "$KEY_PATH.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Move-Item $KEY_PATH $backup
  Write-Host "Existing key moved to $backup"
}
gcloud iam service-accounts keys create $KEY_PATH --iam-account=$SA_EMAIL

Step "Patching $ENV_FILE"
if (-not (Test-Path $ENV_FILE)) {
  if (Test-Path $ENV_EXAMPLE) {
    Copy-Item $ENV_EXAMPLE $ENV_FILE
    Write-Host "Created .env from .env.example"
  } else {
    New-Item -ItemType File -Path $ENV_FILE | Out-Null
  }
}
$envText = Get-Content $ENV_FILE -Raw
function Set-EnvLine($text, $key, $value) {
  $escaped = [Regex]::Escape($key)
  $newLine = "$key=$value"
  if ($text -match "(?m)^${escaped}=.*$") {
    return [Regex]::Replace($text, "(?m)^${escaped}=.*$", $newLine)
  }
  if (-not $text.EndsWith("`n")) { $text += "`n" }
  return $text + "$newLine`n"
}
$envText = Set-EnvLine $envText "GCS_BUCKET" $BUCKET_NAME
$envText = Set-EnvLine $envText "GOOGLE_APPLICATION_CREDENTIALS" $KEY_PATH
if (-not ($envText -match "(?m)^SECRETS_KEY_BASE64=.+$")) {
  $secret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $envText = Set-EnvLine $envText "SECRETS_KEY_BASE64" $secret
  Write-Host "Generated SECRETS_KEY_BASE64 (write it down once if you ever need to decrypt old secrets)"
}
Set-Content -Path $ENV_FILE -Value $envText -NoNewline

Step "Done."
Write-Host ""
Write-Host "Bucket:     gs://$BUCKET_NAME"
Write-Host "Service Account: $SA_EMAIL"
Write-Host "Key file:   $KEY_PATH"
Write-Host ".env patched: $ENV_FILE"
Write-Host ""
Write-Host "Next: cd $REPO_ROOT && pnpm install && pnpm infra:up && pnpm prisma:migrate && pnpm prisma:seed"
