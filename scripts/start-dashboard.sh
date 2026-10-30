#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$HOME/.config/pep-miner-cluster/token"
mkdir -p "$(dirname "$TOKEN_FILE")"

if [ ! -s "$TOKEN_FILE" ]; then
  umask 077
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$TOKEN_FILE"
fi

export PEP_CLUSTER_TOKEN="$(cat "$TOKEN_FILE")"
export PEP_CLUSTER_HOST="${PEP_CLUSTER_HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"

echo "PEP Miner Cluster dashboard starting..."
echo "API token is stored locally at: $TOKEN_FILE"
echo "Open http://127.0.0.1:$PORT on this device."
echo "For multiple devices, expose this port only on a trusted private network."
cd "$ROOT_DIR"
exec node dashboard/server.js
