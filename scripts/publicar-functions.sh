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
  # "TODAS" E A PASTA, NAO UMA LISTA ESCRITA A MAO.
  #
  # Ate 14/09/2026 esta linha era uma lista nominal com 8 nomes, enquanto a
  # pasta ja tinha 12 functions: painel-acesso, painel-crm, painel-gestao e
  # acesso-entrar nunca subiam por aqui, e o script dizia "publica todas" e
  # terminava com exit 0, sem uma linha de aviso. Uma function nova entrava no
  # git, a CI ficava verde, o operador via 8 "deployed" -- e a tela nova
  # respondia 404 porque a porta dela nunca tinha sido publicada.
  #
  # E o MESMO defeito que deixou o casa.js do PCP fora do ar por dias em 13/09:
  # deploy por lista nominal esquece exatamente o arquivo novo, que e o unico
  # que ninguem ainda sabe conferir. Varrer o diretorio nao esquece.
  #
  # `_shared` fica de fora porque nao e function: e biblioteca, e vai junto com
  # cada uma no laco abaixo.
  FUNCOES=()
  for dir in "$RAIZ"/*/; do
    nome="$(basename "$dir")"
    [ "$nome" = "_shared" ] && continue
    [ -f "$dir/index.ts" ] || continue
    FUNCOES+=("$nome")
  done
  # Varredura sem resultado NAO pode terminar em sucesso: "publicou 0" com
  # exit 0 e a mesma mentira que a lista nominal contava. (E com `set -u` no
  # bash 3.2 do Mac, expandir um array vazio ainda estoura "unbound variable",
  # que nao explica nada a quem esta publicando.)
  if [ ${#FUNCOES[@]} -eq 0 ]; then
    echo "Nenhuma function encontrada em $RAIZ -- nada foi publicado." >&2
    exit 1
  fi
  echo "Publicando as ${#FUNCOES[@]} functions de supabase/functions: ${FUNCOES[*]}"
fi

cd "$RAIZ"
falhou=0
for fn in "${FUNCOES[@]}"; do
  [ -f "$fn/index.ts" ] || { echo "$fn: nao existe em supabase/functions"; falhou=1; continue; }

  # A PASTA INTEIRA, NAO SO O index.ts.
  #
  # Ate 14/09/2026 esta linha mandava UM arquivo: o index.ts. O painel-crm tem
  # um irmao na propria pasta -- contrato.ts, com o pedidoCrm/codigo que o
  # index importa na linha 3 -- e ele nunca subia. O Supabase recusava a
  # publicacao inteira com "Module not found contrato.ts", e as outras doze
  # subiam: uma function ficava eternamente na versao velha enquanto o script
  # dizia "publicando as 13".
  #
  # E o MESMO defeito que este arquivo ja conserta duas vezes acima (lista
  # nominal de functions, e  sem os .mjs), um nivel abaixo: lista
  # nominal de ARQUIVOS dentro da function. Varrer a pasta nao esquece. Quem
  # criar o proximo ajudante ao lado do index nao precisa saber deste script.
  args=()
  while IFS= read -r arq; do
    rel="${arq#$fn/}"
    case "$rel" in
      *.mjs|*.js) tipo=application/javascript ;;
      *.json)     tipo=application/json ;;
      *)          tipo=application/typescript ;;
    esac
    args+=(-F "file=@$arq;filename=$rel;type=$tipo")
  done < <(find "$fn" -type f \( -name '*.ts' -o -name '*.mjs' -o -name '*.js' -o -name '*.json' \) | sort)
  # Inclui os módulos compartilhados e suas dependências transitivas. São
  # arquivos de código, sem configurações ou segredos de ambiente.
  #
  # OS .mjs TAMBÉM. O laço pegava só `_shared/*.ts` e três módulos ficavam
  # sempre de fora: acesso-leitura.mjs, fila-backup.mjs e backup-partes.mjs.
  # Enquanto a lista de functions era nominal isso dormia, porque as duas que
  # os importam (painel-acesso e painel-backup) não estavam nela; com a
  # varredura do diretório elas passaram a subir, e subiriam sem o arquivo que
  # o `import` do topo procura -- a porta da Central de Acessos publicada
  # quebrada. O tipo do .mjs é javascript, não typescript.
  for dep in _shared/*.ts; do
    [ -f "$dep" ] && args+=(-F "file=@$dep;filename=../$dep;type=application/typescript")
  done
  for dep in _shared/*.mjs; do
    [ -f "$dep" ] && args+=(-F "file=@$dep;filename=../$dep;type=application/javascript")
  done

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
