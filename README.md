# Painel de Gestao Impresilk

Visao executiva para o CEO da Impresilk Solucoes Visuais: contas atrasadas, fluxo de caixa, produtos e orcamentos. React + Vite, dados do ERP Mubi (somente leitura) via Netlify Functions, e um painel de Configuracoes onde TODAS as regras sao editaveis.

## No ar

**https://painel-impresilk.netlify.app** (site Netlify `painel-impresilk`, time IMPRESILK). Roda em MODO_DEMO ate o Mubi ser ligado.

**Deploy continuo LIGADO** (2026-07-13): o site esta conectado ao repositorio GitHub `leogpereira-afk/painel-impresilk`. Todo `git push` na branch `main` publica sozinho em ~1 minuto (build `npm run build`, publica `dist`, Functions em `netlify/functions`). Nao ha mais passo manual de deploy.

## Como rodar

```bash
export PATH="$HOME/apps/node20/bin:$PATH"
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## Modo demonstracao

Enquanto o Mubi nao estiver conectado, o app roda inteiro com dados de exemplo coerentes (comunicacao visual: adesivo perfurado, DTF UV, lona banner, placa ACM, brinde premium). O interruptor fica em `src/services/mubi.js`:

```js
export const MODO_DEMO = true;  // troque para false quando o Mubi entrar
```

## Arquitetura

- **Regra de ouro:** o Mubi e so leitura (todos os endpoints sao GET). Tudo que o CEO edita (motivo do atraso, marcar cobrado, motivo de perda, parametros, vendedores, classificacoes) vive no lado do painel. Cada tela cruza o dado bruto do Mubi com esses overrides pelo id. **Nenhuma regra fica fixa no codigo: tudo vem de Configuracoes.**
- **Persistencia:** o prompt original citava Supabase. Aqui seguimos o padrao Impresilk (mesmo de hub / rh / instalacao): **Netlify Functions + Netlify Blobs, sem banco e sem backend dedicado.** Hoje a config e os overrides ficam no `localStorage`; a Function `config.js` (Blobs, padrao do blueprint com `connectLambda` e sem `BLOBS_TOKEN`) esta pronta para sincronizar entre aparelhos.
- **services/mubi.js** e a unica porta de acesso ao ERP. O React nunca chama o Mubi direto; chama as Functions, que guardam a chave.

## Estrutura

```
src/
  config/       defaults.js (regras padrao) + store.jsx (estado central, persistencia, recalculo ao vivo)
  services/     mubi.js (demo x Functions) + demo/dados.js (dados de exemplo)
  lib/          format.js, recomendacao.js (motor motivo+dias), calc/ (um calculo por modulo)
  components/   Layout.jsx (shell + logo + nav), ui.jsx (StatCard, Card, BarRow, ...)
  pages/        Home, ContasAtrasadas, FluxoCaixa, Produtos, Orcamentos, Configuracoes
netlify/functions/
  contas-atrasadas.js, fluxo-caixa.js, produtos.js, orcamentos.js  (proxy do Mubi)
  config.js                                                        (Blobs: config + overrides)
  lib/mubi.js                                                      (helper com a chave)
```

## Publicar no GitHub (deploy continuo)

O codigo ja esta em git local (`git init`, branch `main`). Falta so autenticar o GitHub CLI (`gh` ja instalado em `~/apps/bin/gh`). Uma vez logado, o repo e a conexao continua sao criados assim:

```bash
export PATH="$HOME/apps/bin:$HOME/apps/node20/bin:$PATH"
gh auth login                 # conta leogpereira-afk (passo interativo, uma vez)
cd painel
gh repo create painel-impresilk --private --source=. --push
```

Depois, no painel do Netlify (site `painel-impresilk` > Build & deploy > Link repository), conectar o repo para publicar sozinho a cada push. A partir dai, `git push` na `main` ja republica.

## Ligar o Mubi (producao)

API real confirmada (OpenAPI em `api.mubisys.com/api/documentation`):

- Base: `https://api.mubisys.com/api`
- Rota: `{base}/{publicKey}/{recurso}` com `status`, `filtrodata`, `datainicial`, `datafinal` obrigatorios na maioria dos recursos; paginacao `page`/`per_page` (max 500)
- Autenticacao: publicKey no caminho + header `Access-Token` (token de autorizacao do usuario)
- Atencao: a API exige o pacote **MubiPro** no plano (403 sem ele)

No Netlify (Project settings > Environment variables), defina:

- `MUBI_BASE_URL` = `https://api.mubisys.com/api`
- `MUBI_PUBLIC_KEY` = chave publica
- `MUBI_TOKEN` = Access-Token do usuario (pego no painel do Mubisys)
- `TOKEN` = segredo leve para a Function `config.js` (ja definido)

Depois troque `MODO_DEMO` para `false` em `src/services/mubi.js` e faca `git push`.

Ao ver a primeira resposta real de cada endpoint, conferir os nomes dos campos nas Functions (a normalizacao usa `campo()` com varios nomes candidatos; o OpenAPI do Mubisys nao publica os schemas de resposta).

## Marca

Indigo `#3840E8`, Poppins nos titulos e numeros, Spectral no corpo. Fundo `#f4f4f7`, cards brancos. Verde `#16a34a` (bom), ambar `#d97706` (atencao), vermelho `#dc2626` (atencao alta). PT-BR em tudo, sem travessao, celular primeiro, tema claro e escuro. Logomarca oficial da Impresilk no cabecalho.
