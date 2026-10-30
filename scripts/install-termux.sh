#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

pkg update -y
pkg install -y git nodejs-lts clang cmake make
cd "$ROOT_DIR"

if [ ! -f config/config.json ]; then
  cp config/config.example.json config/config.json
  echo "Criado config/config.json. Edite o usuário e a senha da Mining-Dutch antes de minerar."
fi

npm run check
npm run test:pow
npm run test:stratum

echo "Preparação concluída."
echo "Minerador inicial: MINE_THREADS=8 MINE_SECONDS=120 npm run mine"
echo "Otimização nativa ARM64 e validação de share na pool real ainda estão pendentes."
