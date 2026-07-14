# Painel de Gestao Impresilk

Visao executiva para o CEO da Impresilk Solucoes Visuais: contas atrasadas, fluxo de caixa, produtos e orcamentos. React + Vite, dados do ERP Mubi (somente leitura) via Netlify Functions, e um painel de Configuracoes onde TODAS as regras sao editaveis.

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

## Ligar o Mubi (producao)

No Netlify (Project settings > Environment variables), defina:

- `MUBI_BASE_URL` (ex.: `https://api.mubi.com.br/v1`)
- `MUBI_PUBLIC_KEY` (a publicKey que vai no caminho)
- `MUBI_TOKEN` (token de autenticacao, confirmar o metodo exato com a doc)
- `TOKEN` (segredo leve para a Function `config.js`)

Depois troque `MODO_DEMO` para `false` em `src/services/mubi.js`.

Ao ver a primeira resposta real de cada endpoint, ajuste o parse nas Functions (os campos estao marcados com "PONTOS A CONFIRMAR" e usam nomes alternativos como fallback).

## Marca

Indigo `#3840E8`, Poppins nos titulos e numeros, Spectral no corpo. Fundo `#f4f4f7`, cards brancos. Verde `#16a34a` (bom), ambar `#d97706` (atencao), vermelho `#dc2626` (atencao alta). PT-BR em tudo, sem travessao, celular primeiro, tema claro e escuro. Logomarca oficial da Impresilk no cabecalho.
