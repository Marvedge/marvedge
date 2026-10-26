#!/bin/bash
# =============================================================================
# Marvedge GPU Worker — Remediation Script
# Run this on i-02aa4578f3790bae1 (172.31.8.120) via SSM or SSH when the
# original cloud-init failed (e.g. ffmpeg not in AL2023 repos).
# =============================================================================
set -euo pipefail

LOG="/var/log/marvedge-worker-setup.log"
exec > >(tee -a "$LOG") 2>&1

echo "[$(date -u)] Remediation: starting full worker install..."

# --- System deps --------------------------------------------------------------
dnf install -y git curl unzip

# --- FFmpeg static build (includes libass, x264, x265) -----------------------
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
curl -fsSL "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz
mkdir -p /tmp/ffmpeg-extract
tar -xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg-extract --strip-components=1
install -m 755 /tmp/ffmpeg-extract/ffmpeg  /usr/local/bin/ffmpeg
install -m 755 /tmp/ffmpeg-extract/ffprobe /usr/local/bin/ffprobe
rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-extract
echo "FFmpeg: $(ffmpeg -version 2>&1 | head -1)"

# --- Node.js 20 LTS -----------------------------------------------------------
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
echo "Node: $(node --version)"

# --- Clone / update the repo --------------------------------------------------
mkdir -p /opt/marvedge
cd /opt/marvedge
if [ -d ".git" ]; then
  git pull origin master || true
else
  git clone https://github.com/Marvedge/marvedge.git .
fi

# --- Install worker dependencies ----------------------------------------------
cd /opt/marvedge/cloudrun-worker
npm ci --omit=dev

# --- Environment file ---------------------------------------------------------
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

# Fetch secrets securely from SSM Parameter Store
echo "Fetching secrets from SSM Parameter Store..."
WORKER_SECRET=$(aws ssm get-parameter \
  --name "/marvedge/worker/WORKER_SECRET" \
  --with-decryption \
  --region ap-southeast-2 \
  --query "Parameter.Value" \
  --output text)

DEEPGRAM_API_KEY=$(aws ssm get-parameter \
  --name "/marvedge/worker/DEEPGRAM_API_KEY" \
  --with-decryption \
  --region ap-southeast-2 \
  --query "Parameter.Value" \
  --output text)

printf 'WORKER_SECRET=%s\n' "$WORKER_SECRET"   >> "$ENV_DIR/worker.env"
printf 'DEEPGRAM_API_KEY=%s\n' "$DEEPGRAM_API_KEY" >> "$ENV_DIR/worker.env"
unset WORKER_SECRET DEEPGRAM_API_KEY
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
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
UNIT

chown -R ec2-user:ec2-user /opt/marvedge

# --- Enable + start -----------------------------------------------------------
systemctl daemon-reload
systemctl enable marvedge-worker
systemctl restart marvedge-worker

sleep 5
echo "[$(date -u)] Service status:"
systemctl status marvedge-worker --no-pager

echo "[$(date -u)] ✅ Remediation complete."
