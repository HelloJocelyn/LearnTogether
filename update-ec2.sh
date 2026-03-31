#!/usr/bin/env bash
set -euo pipefail

# Fast update script for an already deployed EC2 host.
# - pulls latest code
# - updates backend deps in existing venv
# - rebuilds frontend static files
# - restarts backend + nginx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".git" ]; then
  echo "Run this script from the repo root on EC2."
  exit 1
fi

if [ ! -f "backend/.venv/bin/python" ]; then
  echo "backend venv not found. Run deploy-ec2.sh once first."
  exit 1
fi

echo "Updating source code..."
git fetch origin
git checkout main
git pull --ff-only origin main

echo "Updating backend dependencies..."
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

echo "Building frontend..."
cd "$SCRIPT_DIR/frontend"
npm install
npm run build
cd "$SCRIPT_DIR"

echo "Deploying frontend build..."
sudo mkdir -p /var/www/learntogether
sudo rm -rf /var/www/learntogether/*
sudo cp -r frontend/dist/* /var/www/learntogether/

echo "Restarting services..."
sudo systemctl daemon-reload
sudo systemctl restart learntogether-backend
sudo systemctl reload nginx

echo "Update complete."
echo "Website: http://<EC2_PUBLIC_IP>"
echo "Health:  http://<EC2_PUBLIC_IP>/api/health"
echo "Logs:    sudo journalctl -u learntogether-backend -f"

