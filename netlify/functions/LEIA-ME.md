# netlify/functions — o que ainda roda e o que é história

O Painel migrou para o Supabase em 08/2026. O front aponta direto para as Edge
Functions (`src/lib/api.js`), então **quase nada deste diretório é executado**.
Quase.

## VIVO — não apague

| Arquivo | Quem usa |
|---|---|
| `mubi-cache-background.mjs` | importado por `scripts/carregar-cache.mjs` |
| `lib/mubi.js` | importado por `scripts/carregar-cache.mjs` |

`scripts/carregar-cache.mjs` é o que o workflow **Cache do Mubisys** roda em
produção a cada 20 minutos. Os dois arquivos ficaram aqui de propósito: a carga
leva minutos e uma Edge Function morre em 150s.

Do `mubi-cache-background.mjs`, o que vale são as funções exportadas
(`etapaRapidos`, `etapaCompleta`, `normOS`, `normOrcamento`, `calcDso`…). O
`handler` no fim do arquivo, que grava em Netlify Blobs, esse sim está morto —
quem grava hoje é a Edge Function `painel-cache`.

## MORTO, mas SUBSTITUÍDO

| Arquivo | Versão viva |
|---|---|
| `ativos.js` | `supabase/functions/painel-ativos` |
| `auth.mjs` (já apagado) | `supabase/functions/painel-auth` |
| `backup.js`, `backup-email-background.js` | `supabase/functions/painel-backup` |
| `config.js` | `supabase/functions/painel-config` |
| `contas-atrasadas.js`, `fluxo-caixa.js`, `orcamentos.js`, `produtos.js` | `supabase/functions/painel-dados?modulo=…` |
| `mubi-cache-cron.js`, `mubi-cache-noturno.js` | workflow `.github/workflows/cache-mubisys.yml` |
| `lib/guarda.js` | `supabase/functions/_shared` (só functions mortas o importam) |

**Não adicione regra nova neles**: ela não tem efeito, e a próxima pessoa perde
tempo procurando por que a mudança "não pegou". Foi exatamente o que aconteceu
com o tratamento de `vendedorId`, que existia nos dois lugares.

## MORTO, portado em 04/08/2026

`mubi-realizado-cron.js` e `mubi-realizado-background.mjs`.

Estes ficaram **parados** por um tempo depois da migração: nada calculava o
realizado mês a mês e a chave `fluxo_mensal` não era escrita por ninguém, então
o gráfico do Fluxo de Caixa congelou no último valor do stack Netlify.

A lógica foi portada para `etapaRealizado()` em `mubi-cache-background.mjs`, e
roda pelo modo `--realizado` do `scripts/carregar-cache.mjs` (cron das 07:00
UTC, corrida separada da completa das 06:00). **A sutileza das parcelas veio
junto** — o valor real de cada pagamento está em `pagamentos[]`, não no
`valor_pagamento` do topo, que às vezes vem zerado.

## Por que não apagar tudo de uma vez

Porque a lista acima não é óbvia olhando o diretório: dois arquivos no meio de
functions mortas são o coração da carga. Já perdemos um dia apagando um `.js`
que parecia órfão e guardava função de outro assunto — `node --check` passa
verde e o erro só aparece na tela. A faxina do resto pode ser feita, mas em
commit separado e conferindo import por import.

Também não dá para simplesmente apagar o diretório: `netlify.toml` ainda declara
`[functions] directory = "netlify/functions"`, e `mubi-cache-background.mjs`
importa `@netlify/blobs` no topo — essa dependência precisa continuar no
`package.json` enquanto o import existir.
