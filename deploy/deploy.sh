#!/usr/bin/env bash
# Выкладка на сервер с общим Caddy: копирует код (без данных и .env), собирает образ и перезапускает приложение.
#   deploy/deploy.sh           — только код
#   deploy/deploy.sh --data    — ещё и демо-галерея из data-demo (заменит данные на сервере!)
set -euo pipefail
SERVER="${SERVER:-server.example}"
DIR="${DIR:-igrotvorec}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude 'data*/' --exclude .env --exclude '.env.*' \
  --exclude apps/web/dist --exclude .DS_Store \
  ./ "$SERVER:$DIR/"
rsync -az .env.production.example "$SERVER:$DIR/"

if [[ "${1:-}" == "--data" ]]; then
  # Сбросить журнал SQLite, чтобы копия базы была целой.
  sqlite3 data-demo/gamegen.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
  ssh "$SERVER" "cd $DIR && (docker compose -f docker-compose.vps.yml stop app 2>/dev/null || true)"
  rsync -az --delete data-demo/ "$SERVER:$DIR/data/"
fi

ssh "$SERVER" "cd $DIR && test -f .env || { echo 'нет .env на сервере: cp .env.production.example .env и впишите LLM_API_KEY'; exit 1; }"
ssh "$SERVER" "cd $DIR && docker compose -f docker-compose.vps.yml up -d --build && sleep 5 && docker compose -f docker-compose.vps.yml ps && curl -fsS http://127.0.0.1:18787/api/health && echo"
