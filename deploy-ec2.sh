#!/usr/bin/env bash
set -euo pipefail

# Deploy LearnTogether on one EC2 instance without Docker.
# - frontend: static files served by Nginx on port 80
# - backend: FastAPI (uvicorn) as systemd service on 127.0.0.1:8000

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PYTHON_BIN="python3"

OS_ID=""
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
fi

if [ ! -f ".env.ec2" ]; then
  cat > .env.ec2 <<'EOF'
# Timezone used by backend check-in logic
CHECKIN_TZ=Asia/Tokyo
EOF
  echo "Created .env.ec2 with defaults. Edit if needed."
fi
set -a
source ".env.ec2"
set +a

echo "Pulling latest code from origin/main..."
git fetch origin
git checkout main
git pull --ff-only origin main

echo "Installing system packages..."
if [ "$OS_ID" = "amzn" ]; then
  echo "Amazon Linux detected."
  if command -v dnf >/dev/null 2>&1; then
    # Resolve known Amazon Linux curl/curl-minimal conflicts first.
    sudo dnf install -y --allowerasing curl-minimal libcurl-minimal
    sudo dnf remove -y curl libcurl || true
    sudo dnf install -y python3.11 python3.11-pip nginx git
    PYTHON_BIN="python3.11"
    if ! command -v curl >/dev/null 2>&1; then
      sudo dnf install -y curl-minimal
    fi
    # Force Node 20+ from NodeSource to avoid older distro default (often Node 18).
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs --allowerasing
  else
    sudo yum install -y python3 python3-pip nginx git
    if ! command -v curl >/dev/null 2>&1; then
      sudo yum install -y curl-minimal || sudo yum install -y curl
    fi
    # Force Node 20+ from NodeSource to avoid older distro default (often Node 18).
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  fi
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3 python3-venv python3-pip nodejs npm nginx git
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y python3 python3-pip nodejs npm nginx git
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y python3 python3-pip nodejs npm nginx git
else
  echo "Unsupported package manager. Install python3, pip, node, npm, nginx, git manually."
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter not found: $PYTHON_BIN"
  exit 1
fi
PY_VER="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PY_MAJOR="${PY_VER%%.*}"
PY_MINOR="${PY_VER##*.}"
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
  echo "Python >= 3.10 is required, found: $PY_VER ($PYTHON_BIN)"
  echo "Use Amazon Linux 2023 (python3.11) or install Python 3.10+ manually, then rerun."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not installed correctly."
  exit 1
fi
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js >= 20 is required, found: $(node -v). Trying one-time fix..."
  if [ "$OS_ID" = "amzn" ]; then
    if command -v dnf >/dev/null 2>&1; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo dnf remove -y nodejs npm || true
      sudo dnf install -y nodejs --allowerasing
    elif command -v yum >/dev/null 2>&1; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo yum remove -y nodejs npm || true
      sudo yum install -y nodejs
    fi
  fi
  hash -r
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "Node.js >= 20 is still required, found: $(node -v)"
    echo "Please run manually: sudo dnf remove -y nodejs npm && curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo dnf install -y nodejs"
    exit 1
  fi
fi

echo "Setting up backend virtualenv and dependencies..."
"$PYTHON_BIN" -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

echo "Creating backend systemd service..."
sudo tee /etc/systemd/system/learntogether-backend.service >/dev/null <<EOF
[Unit]
Description=LearnTogether FastAPI Backend
After=network.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=${SCRIPT_DIR}/backend
Environment=CHECKIN_TZ=${CHECKIN_TZ:-Asia/Tokyo}
Environment=CHECKIN_CONFIG_FILE=${SCRIPT_DIR}/backend/config/checkin_window.json
ExecStart=${SCRIPT_DIR}/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "Building frontend..."
cd "${SCRIPT_DIR}/frontend"
npm install
npm run build
cd "${SCRIPT_DIR}"

echo "Deploying frontend static files..."
sudo mkdir -p /var/www/learntogether
sudo rm -rf /var/www/learntogether/*
sudo cp -r frontend/dist/* /var/www/learntogether/

echo "Configuring Nginx..."
sudo tee /etc/nginx/conf.d/learntogether.conf >/dev/null <<'EOF'
server {
  listen 80;
  server_name _;

  root /var/www/learntogether;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

if [ -f /etc/nginx/sites-enabled/default ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

echo "Starting services..."
sudo systemctl daemon-reload
sudo systemctl enable learntogether-backend
sudo systemctl restart learntogether-backend
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "Deployment complete."
echo "Open: http://<EC2_PUBLIC_IP>"
echo "Health check: http://<EC2_PUBLIC_IP>/api/health"
echo "Backend logs: sudo journalctl -u learntogether-backend -f"

