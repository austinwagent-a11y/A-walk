#!/bin/bash
# Austin Walker Real Estate — one-time setup
set -e

echo "=== Austin Walker Real Estate Setup ==="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from template"
fi

echo ""
echo "Enter your HubSpot Private App token (pat-na2-...):"
read -r TOKEN

if [ -n "$TOKEN" ]; then
  sed -i "s|your_private_app_token_here|$TOKEN|" .env
  echo "✓ HubSpot token saved to .env"
fi

echo ""
echo "Enter your domain URL (press Enter to use http://localhost:3000):"
read -r SITE_URL
if [ -n "$SITE_URL" ]; then
  sed -i "s|SITE_URL=.*|SITE_URL=$SITE_URL|" .env
  echo "✓ Site URL saved"
fi

echo ""
echo "✓ Setup complete! Run: npm start"
echo "  Then open: http://localhost:3000"
