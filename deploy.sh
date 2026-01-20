#!/bin/bash

# OpenStride Deployment Script
# Usage: ./deploy.sh [netlify|vercel|manual]

set -e  # Exit on error

echo "🚀 OpenStride Deployment Script"
echo "================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if VITE_APP_BASE_URL is set
if [ -z "$VITE_APP_BASE_URL" ]; then
    echo -e "${YELLOW}⚠️  VITE_APP_BASE_URL not set${NC}"
    echo "Setting default to: https://openstride.org"
    export VITE_APP_BASE_URL="https://openstride.org"
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm ci

echo -e "${BLUE}🧪 Running tests...${NC}"
npm run test:unit

echo -e "${BLUE}🔍 Running linter...${NC}"
npm run lint

echo -e "${BLUE}🏗️  Building for production...${NC}"
npm run build

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo -e "Build output: ${BLUE}dist/${NC}"

# Deployment options
DEPLOY_METHOD=${1:-manual}

case $DEPLOY_METHOD in
  netlify)
    echo -e "${BLUE}🌐 Deploying to Netlify...${NC}"
    if command -v netlify &> /dev/null; then
        netlify deploy --prod --dir=dist
        echo -e "${GREEN}✅ Deployed to Netlify!${NC}"
    else
        echo -e "${RED}❌ Netlify CLI not found. Install with: npm install -g netlify-cli${NC}"
        exit 1
    fi
    ;;

  vercel)
    echo -e "${BLUE}🔺 Deploying to Vercel...${NC}"
    if command -v vercel &> /dev/null; then
        vercel --prod
        echo -e "${GREEN}✅ Deployed to Vercel!${NC}"
    else
        echo -e "${RED}❌ Vercel CLI not found. Install with: npm install -g vercel${NC}"
        exit 1
    fi
    ;;

  manual)
    echo -e "${YELLOW}📋 Manual deployment selected${NC}"
    echo ""
    echo "Build is ready in ./dist/"
    echo ""
    echo "Next steps:"
    echo "1. Upload the dist/ folder to your web server"
    echo "2. Configure your web server (nginx, Apache, etc.)"
    echo "3. Set up SSL certificate"
    echo "4. Verify VITE_APP_BASE_URL is set correctly in production"
    echo ""
    echo "For nginx, example config:"
    echo -e "${BLUE}"
    cat << 'EOF'
server {
    listen 80;
    server_name openstride.org;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name openstride.org;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/openstride/dist;
    index index.html;

    # Vue Router history mode
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    echo -e "${NC}"
    ;;

  *)
    echo -e "${RED}❌ Unknown deployment method: $DEPLOY_METHOD${NC}"
    echo "Usage: ./deploy.sh [netlify|vercel|manual]"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}🎉 Deployment process completed!${NC}"
