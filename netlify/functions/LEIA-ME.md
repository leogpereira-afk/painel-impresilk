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

## MORTO — história, não código

`ativos.js`, `auth.mjs` (apagado), `backup.js`, `backup-email-background.js`,
`config.js`, `contas-atrasadas.js`, `fluxo-caixa.js`, `orcamentos.js`,
`produtos.js`, `mubi-cache-cron.js`, `mubi-cache-noturno.js`,
`mubi-realizado-cron.js`, `mubi-realizado-background.mjs`.

A versão viva de cada um está em `supabase/functions/painel-*`. **Não adicione
regra nova neles**: ela não tem efeito, e a próxima pessoa perde tempo
procurando por que a mudança "não pegou". Foi exatamente o que aconteceu com o
tratamento de `vendedorId`, que existia nos dois lugares.

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
