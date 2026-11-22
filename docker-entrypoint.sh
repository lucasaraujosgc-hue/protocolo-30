#!/bin/sh
# Garante que o volume de dados pertence ao usuário "node" e roda o app sem root.
set -e
mkdir -p "${DATA_DIR:-/app/data}"
chown -R node:node "${DATA_DIR:-/app/data}" 2>/dev/null || true
exec su-exec node "$@"
