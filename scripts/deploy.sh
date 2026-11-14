#!/usr/bin/env bash
# deploy.sh — Cloudflare Pages direct upload por tag (padrão pedroluisbrilhadori).
# Uso: ./scripts/deploy.sh <projeto-cloudflare-pages>
# Requer: wrangler autenticado (CLOUDFLARE_API_TOKEN no ambiente do executor).
set -euo pipefail

PLANO=(
  "[1/3] Verificar pré-requisitos (wrangler, tag v*, worktree limpo)"
  "[2/3] Build-less: validar dados e testes antes de subir"
  "[3/3] wrangler pages deploy do diretório raiz do projeto"
)

PROJETO="${1:-}"
if [[ -z "$PROJETO" ]]; then
  echo "uso: $0 <projeto-cloudflare-pages>" >&2
  exit 2
fi

for p in "${PLANO[@]}"; do echo "PLANO: $p"; done

# [1/3]
command -v wrangler >/dev/null || { echo "[ERRO] wrangler não encontrado no PATH do executor" >&2; exit 2; }
TAG_ATUAL="$(git describe --tags --exact-match 2>/dev/null || true)"
[[ "$TAG_ATUAL" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "[ERRO] deploy só por tag v* — checkout da tag antes de deployar (atual: '${TAG_ATUAL:-nenhuma}')" >&2
  exit 2
}
[[ -z "$(git status --porcelain)" ]] || { echo "[ERRO] worktree sujo — commit antes de deployar" >&2; exit 2; }
echo "[1/3] ok (tag $TAG_ATUAL, worktree limpo)"

# [2/3]
node scripts/gerar-dados.mjs --check
node --test
echo "[2/3] ok (dados coerentes, testes passando)"

# [3/3]
echo "[3/3] Subindo para Cloudflare Pages (projeto: $PROJETO)…"
wrangler pages deploy . --project-name="$PROJETO" --commit-dirty=true
echo "Deploy concluído: tag $TAG_ATUAL no projeto $PROJETO"
