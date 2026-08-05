#!/bin/bash
# ============================================================================
# Publica as Edge Functions do painel no Supabase.
#
# POR QUE ESTE ARQUIVO EXISTE: a integracao GitHub<->Supabase do projeto
# pertence ao repositorio do RH e so publica as functions DELE. As do painel
# sobem pela Management API, e a cada mudanca -- sem isto, o codigo fica no
# git e o servidor continua rodando a versao velha, calado.
#
# COMO USAR (o token e o "personal access token" do Supabase, comeca com sbp_;
# pegue em https://supabase.com/dashboard/account/tokens):
#
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   ./scripts/publicar-functions.sh                 # publica todas
#   ./scripts/publicar-functions.sh painel-auth     # so uma
#
# O token NAO fica gravado em lugar nenhum: sai do ambiente e some quando o
# terminal fecha. Nunca escreva ele num arquivo do repositorio -- este repo e
# publico.
# ============================================================================
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-heveemylixartyijxewh}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
RAIZ="$(cd "$(dirname "$0")/../supabase/functions" && pwd)"

if [ -z "$TOKEN" ]; then
  echo "Falta o token. Rode:  export SUPABASE_ACCESS_TOKEN=sbp_..." >&2
  exit 1
fi

FUNCOES=("$@")
if [ ${#FUNCOES[@]} -eq 0 ]; then
  FUNCOES=(painel-auth painel-config painel-ativos painel-dados painel-cache painel-backup)
fi

cd "$RAIZ"
falhou=0
for fn in "${FUNCOES[@]}"; do
  [ -f "$fn/index.ts" ] || { echo "$fn: nao existe em supabase/functions"; falhou=1; continue; }

  # _shared/cripto.ts sobe junto de quem importa (login e conferencia de cracha).
  # O nome do arquivo tem de ser o CAMINHO RELATIVO que o import usa
  # ("../_shared/cripto.ts"), senao o bundle nao resolve e a function sobe morta.
  args=(-F "file=@$fn/index.ts;filename=index.ts;type=application/typescript")
  if grep -q "_shared/cripto.ts" "$fn/index.ts"; then
    args+=(-F "file=@_shared/cripto.ts;filename=../_shared/cripto.ts;type=application/typescript")
  fi

  # POST /functions/deploy com uma parte `metadata` em JSON. O caminho antigo
  # (PATCH /functions/<slug> com os campos na query string) responde
  # "Cannot read properties of undefined" desde agosto/2026 -- e o erro nao diz
  # nada sobre o que mudou, entao fica registrado aqui.
  #
  # verify_jwt=false de proposito: quem confere o cracha e a propria function,
  # com o PAINEL_JWT_SECRET. O gateway do Supabase nao conhece esse cracha.
  resp=$(curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$fn" \
    -H "Authorization: Bearer $TOKEN" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$fn\",\"verify_jwt\":false};type=application/json" \
    "${args[@]}") || { echo "$fn: falhou a chamada"; falhou=1; continue; }

  echo "$resp" | FN="$fn" python3 -c "
import json, os, sys
fn = os.environ['FN']
try:
    d = json.load(sys.stdin)
except Exception:
    print(f'{fn}: resposta inesperada'); sys.exit(1)
if d.get('version'):
    print(f\"{fn}: {d.get('status')} v{d.get('version')}\")
else:
    print(f\"{fn}: ERRO -- {d.get('message') or d}\"); sys.exit(1)
" || falhou=1
done

exit $falhou
