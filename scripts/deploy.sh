#!/usr/bin/env bash
# Deploy da campanha pressao-plp299 no Cloudflare Pages.
#
# Mesmo padrão do pedroluisbrilhadori/ (scripts/deploy.sh): o token CF
# (CF_DNS_API_TOKEN) vive na db01 (/etc/traefik-env) e é restrito ao egress
# dela — build não existe (site estático puro), e TODA chamada de API e o
# wrangler (via docker node:22) executam NA db01. O token nunca sai de lá,
# nunca vai para argv nem para log.
#
# USO:
#   bash scripts/deploy.sh              # empacota arquivos do site + deploy + domínio
#   bash scripts/deploy.sh --check      # só lê e reporta (nenhuma mutação)
#
# Variáveis de ambiente:
#   DEPLOY_DB       — alvo ssh (default pedro@100.64.0.1)
#   DEPLOY_SSH_KEY  — chave ssh (default ~/.ssh/id_ed25519_oci)
set -euo pipefail

DB="${DEPLOY_DB:-pedro@100.64.0.1}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_oci}"
PROJECT="plp299nao"
DOMAIN="plp299nao.pedroluisbrilhadori.com.br"
ZONE_DOMAIN="pedroluisbrilhadori.com.br"
REMOTE_DIR="/tmp/plp299nao-dist"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1
TOTAL=6
n=0
step() { n=$((n+1)); echo "[$n/$TOTAL] $1"; }

cd "$(dirname "$0")/.."

command -v jq >/dev/null || { echo "ERRO: jq ausente localmente"; exit 2; }
[[ -f index.html ]] || { echo "ERRO: index.html ausente — rode na raiz do projeto"; exit 2; }
[[ -z "$(git status --porcelain -- index.html css js)" ]] \
  || { echo "ERRO: arquivos do site alterados sem commit — commit antes de deployar"; exit 2; }
ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$DB" "command -v jq >/dev/null" \
  || { echo "ERRO: jq ausente na db01"; exit 2; }

step "empacotar arquivos do site (index.html, css/, js/, og-image.png)"
if [[ $CHECK -eq 1 ]]; then
  echo "  --check: pulado"
else
  [[ -f og-image.png ]] || { echo "ERRO: og-image.png ausente — gere o card de preview antes de deployar"; exit 2; }
  TAR="/tmp/plp299nao-site.tar.gz"
  tar -czf "$TAR" index.html css js og-image.png
  echo "  $(tar -tzf "$TAR" | grep -c .) arquivos"
fi

step "transferir → db01:$REMOTE_DIR"
if [[ $CHECK -eq 1 ]]; then
  echo "  --check: pulado"
else
  ssh -i "$KEY" -o BatchMode=yes "$DB" "sudo rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR"
  ssh -i "$KEY" -o BatchMode=yes "$DB" "rm -f /tmp/plp299nao-site.tar.gz"
  scp -q -i "$KEY" /tmp/plp299nao-site.tar.gz "$DB:/tmp/plp299nao-site.tar.gz"
  ssh -i "$KEY" -o BatchMode=yes "$DB" "tar -xz -C $REMOTE_DIR -f /tmp/plp299nao-site.tar.gz && rm -f /tmp/plp299nao-site.tar.gz && echo \"  \$(find $REMOTE_DIR -type f | wc -l) arquivos\""
  rm -f "$TAR"
fi

step "validar token e coletar ids (na db01)"
read -r ZONE_ID ACC_ID < <(ssh -i "$KEY" -o BatchMode=yes "$DB" '
  H=$(mktemp) && chmod 600 "$H" && trap "rm -f \"$H\"" EXIT
  printf "Authorization: Bearer %s\n" "$(sudo grep "^CF_DNS_API_TOKEN=" /etc/traefik-env | cut -d= -f2-)" > "$H"
  CF="https://api.cloudflare.com/client/v4"
  ZONE_ID=$(curl -sS --max-time 15 -H @"$H" "$CF/zones?name='"$ZONE_DOMAIN"'" | jq -r ".result[0].id // empty")
  [ -n "$ZONE_ID" ] || { echo "ERRO: zona '"$ZONE_DOMAIN"' não visível ao token" >&2; exit 3; }
  ACC_ID=$(curl -sS -H @"$H" "$CF/zones/$ZONE_ID" | jq -r ".result.account.id // empty")
  echo "$ZONE_ID $ACC_ID"
' | awk '{print $1, $2}')
[[ -n "${ACC_ID:-}" ]] || { echo "ERRO: não obtive account_id"; exit 3; }
echo "  zona=${ZONE_ID:0:8}… conta=${ACC_ID:0:8}…"

run_cf_api() { # run_cf_api "MÉTODO" "PATH" [JSON] → corpo da resposta
  local metodo=$1 path=$2 data=${3:-}
  ssh -i "$KEY" -o BatchMode=yes "$DB" "
    H=\$(mktemp) && chmod 600 \"\$H\" && trap 'rm -f \"\$H\"' EXIT
    printf 'Authorization: Bearer %s\n' \"\$(sudo grep '^CF_DNS_API_TOKEN=' /etc/traefik-env | cut -d= -f2-)\" > \"\$H\"
    curl -sS --max-time 20 -X $metodo -H @\"\$H\" ${data:+-H 'Content-Type: application/json' -d '$data'} \\
      'https://api.cloudflare.com/client/v4$path'
  "
}

step "garantir projeto Pages '$PROJECT'"
PROJ=$(run_cf_api GET "/accounts/$ACC_ID/pages/projects/$PROJECT")
if jq -e '.success == true' <<<"$PROJ" >/dev/null; then
  echo "  projeto já existe"
elif [[ $CHECK -eq 1 ]]; then
  echo "  --check: projeto ausente — seria criado no deploy real"
else
  run_cf_api POST "/accounts/$ACC_ID/pages/projects" \
    "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}" | jq -e '.success' >/dev/null \
    && echo "  projeto criado" || { echo "ERRO ao criar projeto: $PROJ"; exit 1; }
fi

step "publicar site (wrangler via docker, na db01)"
if [[ $CHECK -eq 1 ]]; then
  echo "  --check: pulado"
else
  # CLOUDFLARE_ACCOUNT_ID explícito: o token não lista contas via /accounts
  ssh -i "$KEY" -o BatchMode=yes "$DB" "
    ENVF=\$(mktemp) && chmod 600 \"\$ENVF\" && trap 'rm -f \"\$ENVF\"' EXIT
    printf 'CLOUDFLARE_API_TOKEN=%s\nCLOUDFLARE_ACCOUNT_ID=%s\n' \
      \"\$(sudo grep '^CF_DNS_API_TOKEN=' /etc/traefik-env | cut -d= -f2-)\" \"$ACC_ID\" > \"\$ENVF\"
    docker run --rm -v $REMOTE_DIR:/dist -w /dist --env-file \"\$ENVF\" node:22-alpine \
      sh -c 'npx --yes wrangler@4 pages deploy . --project-name=$PROJECT --branch=main --commit-dirty=true' \
      | tail -5
  "
fi

step "domínio $DOMAIN (custom domain + CNAME proxied)"
DOM=$(run_cf_api GET "/accounts/$ACC_ID/pages/projects/$PROJECT/domains")
if jq -e --arg d "$DOMAIN" '.result[]? | select(.name == $d)' <<<"$DOM" >/dev/null; then
  echo "  custom domain já registrado ($(jq -r --arg d "$DOMAIN" '.result[] | select(.name == $d) | .status' <<<"$DOM"))"
elif [[ $CHECK -eq 1 ]]; then
  echo "  --check: custom domain ausente — seria registrado"
else
  run_cf_api POST "/accounts/$ACC_ID/pages/projects/$PROJECT/domains" "{\"name\":\"$DOMAIN\"}" \
    | jq -e '.success' >/dev/null && echo "  custom domain registrado"
fi
CNAME=$(run_cf_api GET "/zones/$ZONE_ID/dns_records?type=CNAME&name=$DOMAIN")
if jq -e '.result | length > 0' <<<"$CNAME" >/dev/null; then
  echo "  CNAME já existe"
elif [[ $CHECK -eq 1 ]]; then
  echo "  --check: CNAME ausente — seria criado (→ $PROJECT.pages.dev, proxied)"
else
  run_cf_api POST "/zones/$ZONE_ID/dns_records" \
    "{\"type\":\"CNAME\",\"name\":\"$DOMAIN\",\"content\":\"$PROJECT.pages.dev\",\"proxied\":true,\"ttl\":1}" \
    | jq -e '.success' >/dev/null && echo "  CNAME criado (→ $PROJECT.pages.dev)"
fi

echo
if [[ $CHECK -eq 1 ]]; then
  echo "check concluído — nenhuma mutação feita. Rode sem --check para publicar."
else
  echo "Deploy enviado. https://$PROJECT.pages.dev · https://$DOMAIN (cert/validação do custom domain pode levar alguns minutos)"
fi
