# OpenStride Firebase Deployment Script (PowerShell)
# Project: openstrive-edd63

$ErrorActionPreference = "Stop"

Write-Host "🚀 OpenStride Firebase Deployment" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if firebase-tools is installed
try {
    $null = Get-Command firebase -ErrorAction Stop
} catch {
    Write-Host "❌ Firebase CLI not found" -ForegroundColor Red
    Write-Host "Install with: npm install -g firebase-tools"
    exit 1
}

# Check if logged in
try {
    firebase projects:list | Out-Null
} catch {
    Write-Host "⚠️  Not logged in to Firebase" -ForegroundColor Yellow
    Write-Host "Running: firebase login"
    firebase login
}

# Set environment variable for production
Write-Host "🔧 Setting production environment..." -ForegroundColor Blue
$env:VITE_APP_BASE_URL = "https://openstride.org"
Write-Host "VITE_APP_BASE_URL=$env:VITE_APP_BASE_URL"
Write-Host ""

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""

# Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Blue
npm run test:unit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Tests failed" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ""

# Run linter
Write-Host "🔍 Running linter..." -ForegroundColor Blue
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Linting failed" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ""

# Build for production
Write-Host "🏗️  Building for production..." -ForegroundColor Blue
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ""

# Check build output
if (!(Test-Path "dist")) {
    Write-Host "❌ Build failed: dist/ directory not found" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Show build info
Write-Host "📊 Build information:" -ForegroundColor Blue
$distSize = (Get-ChildItem -Path "dist" -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host ("Build size: {0:N2} MB" -f ($distSize / 1MB))
Write-Host ""

# Ask for confirmation
$confirmation = Read-Host "🚀 Deploy to Firebase Hosting (openstrive-edd63)? [y/N]"

if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    Write-Host "🌐 Deploying to Firebase Hosting..." -ForegroundColor Blue
    firebase deploy --only hosting

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment completed!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌍 Your app is live at:" -ForegroundColor Cyan
        Write-Host "https://openstride.org" -ForegroundColor Blue
        Write-Host ""
    } else {
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} else {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Yellow
    Write-Host "Build is ready in ./dist/ if you want to deploy manually"
}

Write-Host ""
Write-Host "🎉 Done!" -ForegroundColor Green
