#!/usr/bin/env bash
set -euo pipefail

# Fast update script for an already deployed EC2 host.
# - pulls latest code
# - updates backend deps in existing venv
# - rebuilds frontend static files
# - restarts backend + nginx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f ".env.ec2" ]; then
  set -a
  source ".env.ec2"
  set +a
fi

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

echo "Ensuring backend runs in production mode..."
sudo mkdir -p /etc/systemd/system/learntogether-backend.service.d
sudo tee /etc/systemd/system/learntogether-backend.service.d/env.conf >/dev/null <<EOF
[Service]
Environment=APP_ENV=production
Environment=CHECKIN_TZ=${CHECKIN_TZ:-Asia/Tokyo}
Environment=CHECKIN_CONFIG_FILE=${SCRIPT_DIR}/backend/config/checkin_window.production.json
EOF

echo "Restarting services..."
sudo systemctl daemon-reload
sudo systemctl restart learntogether-backend
sudo systemctl reload nginx

echo "Update complete."
echo "Website: http://<EC2_PUBLIC_IP>"
echo "Health:  http://<EC2_PUBLIC_IP>/api/health"
echo "Logs:    sudo journalctl -u learntogether-backend -f"

