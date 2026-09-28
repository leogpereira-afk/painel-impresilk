# Painel de Gestao Impresilk

Visao executiva para o CEO da Impresilk Solucoes Visuais: contas atrasadas, fluxo de caixa, produtos e orcamentos. React + Vite no GitHub Pages, dados no Supabase (Edge Functions + Postgres), carga do ERP Mubi (somente leitura) pelo GitHub Actions, e um painel de Configuracoes onde TODAS as regras sao editaveis.

## No ar

**https://leogpereira-afk.github.io/painel-impresilk/** (GitHub Pages).

Todo `git push` na `main` passa pelas verificacoes e publica sozinho:

- a tela, pelo workflow `pages.yml` (testes, lint, build com `BASE_PATH=/painel-impresilk/`);
- as Edge Functions, pelo workflow `functions.yml` (`scripts/publicar-functions.sh`), quando algo muda em `supabase/functions/`.

As functions dos **outros sistemas** (lista em `scripts/sistemas-functions.json`) sobem pelo workflow `functions-sistemas.yml`, de hora em hora: so a function cuja main tem commit mais novo que a versao no ar (`scripts/publicar-sistemas.mjs`). Os dois workflows usam o mesmo secret `SUPABASE_ACCESS_TOKEN` (Edge Functions read-write nos projetos impresilk e Projetos Léo).

## Como rodar

```bash
export PATH="$HOME/apps/node20/bin:$PATH"
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## Modo demonstracao

O app tem um modo com dados de exemplo coerentes (comunicacao visual: adesivo perfurado, DTF UV, lona banner, placa ACM, brinde premium). Ele liga sozinho no modo `review` (`npm run review`); o interruptor fica em `src/services/mubi.js`:

```js
export const MODO_DEMO = import.meta.env.MODE === "review";
```

## Arquitetura

- **Regra de ouro:** o Mubi e so leitura (todos os endpoints sao GET). Tudo que o CEO edita (motivo do atraso, marcar cobrado, motivo de perda, parametros, vendedores, classificacoes) vive no lado do painel. Cada tela cruza o dado bruto do Mubi com esses overrides pelo id. **Nenhuma regra fica fixa no codigo: tudo vem de Configuracoes.**
- **Persistencia:** Supabase (Postgres), pelas Edge Functions `painel-*`: configuracoes e overrides na `painel-config`, dados do ERP em cache servidos pela `painel-dados`.
- **Carga do ERP:** o Mubisys e lento demais para uma Edge Function (ela morre em 150 s), entao a carga roda no GitHub Actions: `cache-mubisys.yml` (a cada 20 min, `scripts/carregar-cache.mjs`), `crm-mubisys.yml` e `importar-os-pcp.yml`. O cliente do ERP e as regras de normalizacao moram em `scripts/lib/`; quem grava o cache e a Edge Function `painel-cache`.
- **services/mubi.js** e a unica porta da tela para os dados do ERP: le o cache, nunca o Mubi direto.

## Estrutura

```
src/
  config/       defaults.js (regras padrao) + store.jsx (estado central, persistencia, recalculo ao vivo)
  services/     mubi.js (dados do ERP pelo cache) + demo/dados.js (dados de exemplo) + um servico por modulo
  lib/          format.js, recomendacao.js (motor motivo+dias), calc/ (um calculo por modulo)
  components/   Layout.jsx (shell + logo + nav), ui.jsx (StatCard, Card, BarRow, ...)
  pages/        Home, ContasAtrasadas, FluxoCaixa, Produtos, Orcamentos, Configuracoes, ...
supabase/functions/
  painel-*, acesso-entrar                                      (Edge Functions)
scripts/
  carregar-cache.mjs, carregar-crm.mjs, importar-os-pcp.mjs    (cargas do ERP no Actions)
  lib/mubi.js, lib/mubi-cache.mjs                              (cliente do ERP e normalizacao)
```

## Ligar o Mubi (producao)

API real confirmada (OpenAPI em `api.mubisys.com/api/documentation`):

- Base: `https://api.mubisys.com/api`
- Rota: `{base}/{publicKey}/{recurso}` com `status`, `filtrodata`, `datainicial`, `datafinal` obrigatorios na maioria dos recursos; paginacao `page`/`per_page` (max 500)
- Autenticacao: publicKey no caminho + header `Access-Token` (token de autorizacao do usuario)
- Atencao: a API exige o pacote **MubiPro** no plano (403 sem ele)

Nos secrets do repositorio no GitHub (Settings > Secrets and variables > Actions):

- `MUBI_BASE_URL` = `https://api.mubisys.com/api`
- `MUBI_PUBLIC_KEY` = chave publica
- `MUBI_TOKEN` = Access-Token do usuario (pego no painel do Mubisys)
- `PAINEL_TOKEN` = autoriza a carga a gravar o cache na `painel-cache`

Ao ver a primeira resposta real de cada endpoint, conferir os nomes dos campos em `scripts/lib/mubi-cache.mjs` (a normalizacao usa `campo()` com varios nomes candidatos; o OpenAPI do Mubisys nao publica os schemas de resposta).

## Marca

Indigo `#3840E8`, Poppins nos titulos e numeros, Spectral no corpo. Fundo `#f4f4f7`, cards brancos. Verde `#16a34a` (bom), ambar `#d97706` (atencao), vermelho `#dc2626` (atencao alta). PT-BR em tudo, sem travessao, celular primeiro, tema claro e escuro. Logomarca oficial da Impresilk no cabecalho.
