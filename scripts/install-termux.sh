#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
pkg update -y
pkg install -y git nodejs-lts clang cmake make
cd "$ROOT_DIR"
node --check dashboard/server.js
echo "Dependencias instaladas. Inicie com: bash scripts/start-dashboard.sh"
echo "O motor nativo Scrypt ainda não foi implementado."
