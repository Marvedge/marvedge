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
dnf install -y git curl unzip

# --- FFmpeg: Amazon Linux 2023 doesn't ship ffmpeg in default repos.
# Install the johnvansickle.com static build (GPL, x86_64, includes libass).
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
curl -fsSL "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz
mkdir -p /tmp/ffmpeg-extract
tar -xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg-extract --strip-components=1
install -m 755 /tmp/ffmpeg-extract/ffmpeg  /usr/local/bin/ffmpeg
install -m 755 /tmp/ffmpeg-extract/ffprobe /usr/local/bin/ffprobe
rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-extract
ffmpeg -version | head -1

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
  git pull origin master || true
else
  git clone https://github.com/Marvedge/marvedge.git .
fi

# --- Install worker dependencies ----------------------------------------------
cd /opt/marvedge/cloudrun-worker
npm ci --omit=dev

# --- Environment ---
# Non-secret configuration is written inline.
# Secrets (WORKER_SECRET, DEEPGRAM_API_KEY) are fetched live from SSM Parameter
# Store at boot so that no credentials are stored in this script or in git history.
#
# Required SSM parameters (SecureString, created once by an admin):
#   /marvedge/worker/WORKER_SECRET
#   /marvedge/worker/DEEPGRAM_API_KEY
#
# The EC2 IAM role (marvedge-worker-role) must have:
#   ssm:GetParameter on arn:aws:ssm:ap-southeast-2:*:parameter/marvedge/worker/*

ENV_DIR="/etc/marvedge"
install -d -m 0700 "$ENV_DIR"

# Write non-secret config
cat > "$ENV_DIR/worker.env" << 'WORKERENV'
STORAGE_PROVIDER=aws
AWS_REGION=ap-southeast-2
RAW_BUCKET=marvedge-raw-ap2
PROCESSED_BUCKET=marvedge-processed-ap2
RECIPES_COLLECTION=marvedge-recipes
CHUNKS_COLLECTION=marvedge-chunks
PORT=8080
WORKERENV

# Append secrets fetched from SSM Parameter Store (never stored in this script)
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
