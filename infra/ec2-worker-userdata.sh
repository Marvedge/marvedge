#!/bin/bash
# =============================================================================
# Marvedge GPU Worker — EC2 Startup Script (User Data)
# Instance: g4dn.xlarge | AMI: Deep Learning OSS Nvidia AL2023 | ap-southeast-2
# =============================================================================
set -euo pipefail

LOG="/var/log/marvedge-worker-setup.log"
exec > >(tee -a "$LOG") 2>&1

echo "[$(date -u)] Starting Marvedge worker setup..."

# --- System update + essentials -----------------------------------------------
dnf update -y
dnf install -y git curl unzip ffmpeg

# --- Node.js 20 LTS -----------------------------------------------------------
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node --version

# --- AWS CLI v2 (pre-installed on DL AMI, but ensure latest) ------------------
/usr/local/bin/aws --version || true

# --- Clone the worker from GitHub (main branch) -------------------------------
mkdir -p /opt/marvedge
cd /opt/marvedge

# If already cloned (AMI baked or re-run), just pull
if [ -d ".git" ]; then
  git pull origin main || true
else
  git clone https://github.com/Marvedge/marvedge.git .
fi

# --- Install worker dependencies ----------------------------------------------
cd /opt/marvedge/cloudrun-worker
npm ci --omit=dev

# --- Environment (injected from AWS Secrets Manager or SSM Parameter Store) ---
# In production, replace these with:
#   aws ssm get-parameters-by-path --path /marvedge/worker/ --with-decryption
# For now, the worker reads from /etc/marvedge/worker.env

ENV_DIR="/etc/marvedge"
mkdir -p "$ENV_DIR"
cat > "$ENV_DIR/worker.env" << 'WORKERENV'
STORAGE_PROVIDER=aws
AWS_REGION=ap-southeast-2
RAW_BUCKET=marvedge-raw-ap2
PROCESSED_BUCKET=marvedge-processed-ap2
RECIPES_COLLECTION=marvedge-recipes
CHUNKS_COLLECTION=marvedge-chunks
PORT=8080
WORKERENV

# Permissions: root-readable only (contains secrets)
chmod 600 "$ENV_DIR/worker.env"

# --- Systemd service ----------------------------------------------------------
cat > /etc/systemd/system/marvedge-worker.service << 'UNIT'
[Unit]
Description=Marvedge GPU Video Processing Worker
After=network.target
Wants=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/marvedge/cloudrun-worker
EnvironmentFile=/etc/marvedge/worker.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marvedge-worker

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
UNIT

# --- Enable and start ---------------------------------------------------------
chown -R ec2-user:ec2-user /opt/marvedge
systemctl daemon-reload
systemctl enable marvedge-worker
systemctl start marvedge-worker

echo "[$(date -u)] Marvedge worker setup complete. Service status:"
systemctl status marvedge-worker --no-pager
