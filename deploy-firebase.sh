#!/bin/bash

# OpenStride Firebase Deployment Script
# Project: openstrive-edd63

set -e  # Exit on error

echo "🚀 OpenStride Firebase Deployment"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if firebase-tools is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Firebase${NC}"
    echo "Running: firebase login"
    firebase login
fi

# Set environment variable for production
echo -e "${BLUE}🔧 Setting production environment...${NC}"
export VITE_APP_BASE_URL="https://openstride.org"
echo "VITE_APP_BASE_URL=$VITE_APP_BASE_URL"
echo ""

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm ci
echo ""

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm run test:unit
echo ""

# Run linter
echo -e "${BLUE}🔍 Running linter...${NC}"
npm run lint
echo ""

# Build for production
echo -e "${BLUE}🏗️  Building for production...${NC}"
npm run build
echo ""

# Check build output
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed: dist/ directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""

# Show build info
echo -e "${BLUE}📊 Build information:${NC}"
du -sh dist/
echo "Files in dist/:"
ls -lh dist/ | head -10
echo ""

# Ask for confirmation
read -p "🚀 Deploy to Firebase Hosting (openstrive-edd63)? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🌐 Deploying to Firebase Hosting...${NC}"
    firebase deploy --only hosting

    echo ""
    echo -e "${GREEN}✅ Deployment completed!${NC}"
    echo ""
    echo "🌍 Your app is live at:"
    echo -e "${BLUE}https://openstride.org${NC}"
    echo ""

    # Show recent deployments
    echo "Recent deployments:"
    firebase hosting:channel:list 2>/dev/null || echo "Use Firebase Console for deployment history"
else
    echo -e "${YELLOW}❌ Deployment cancelled${NC}"
    echo "Build is ready in ./dist/ if you want to deploy manually"
fi

echo ""
echo -e "${GREEN}🎉 Done!${NC}"
