# Central Comercial — validação de desempenho local

Data: 17/10/2026. Medição local da implementação em revisão, sem publicar, consultar credenciais ou modificar dados reais.

## Método

- Antes: código do commit `0f6ce560f9322fd06ad9133cd28f38889ca4a286`, extraído para uma pasta temporária. Depois: cópia da implementação da Central Comercial em revisão, feita antes da medição.
- Ambos compilados com `vite build --mode review --config vite.review.config.js`, na mesma máquina e com as mesmas dependências. Os arquivos minificados foram servidos por HTTP apenas em `127.0.0.1`, nas portas 4293 e 4294.
- Chrome headless **155.0.8059.80**, macOS/arm64, janela de 1440 × 1000, sem limitação artificial de rede ou CPU. Cada amostra abriu um contexto limpo, sem service worker. O teste bloqueava qualquer origem externa; não houve tentativa externa nem erro JavaScript.
- Três repetições por versão e rota, alternando antes/depois: 12 entradas completas. Perfil de direção fictício, com todos os módulos disponíveis, para observar o prefetch antigo das rotas permitidas.
- As fontes fictícias de Bancos e do Comercial existente foram conferidas como idênticas. O novo hook de Dashboard não altera as actions antigas. Não foi comparada a velocidade do Dashboard novo com o relatório antigo, pois suas perguntas e dados são diferentes.
- “Conteúdo pronto”: título de Bancos depois da leitura da lista, ou indicador “Retornos de hoje” depois da apuração do Comercial; em seguida, dois ciclos de renderização. É um marcador do teste, não uma métrica padronizada de experiência real.
- Volume inicial: scripts concluídos até esse marcador. Volume após espera: scripts concluídos aos **4,5 segundos** desde a entrada, capturando o prefetch anterior iniciado após 2 segundos.
- Bytes de JavaScript são a soma dos arquivos únicos efetivamente solicitados, sem compressão, confirmada por `PerformanceResourceTiming.decodedBodySize`. O servidor local não aplicou gzip. CSS, fontes, imagens e cabeçalhos HTTP não entram nessa soma.

## JavaScript efetivamente carregado

Os volumes e as quantidades de arquivos foram iguais nas três repetições de cada cenário.

| Entrada | Momento | Antes | Depois | Diferença |
|---|---|---:|---:|---:|
| Bancos e Pix | Conteúdo pronto | 22 arquivos · 557.815 bytes | 24 arquivos · 591.945 bytes | +34.130 bytes |
| Bancos e Pix | Após 4,5 s | 90 arquivos · 1.742.391 bytes | 24 arquivos · 591.945 bytes | **−66,03%** |
| Comercial | Conteúdo pronto | 34 arquivos · 688.497 bytes | 37 arquivos · 724.252 bytes | +35.755 bytes |
| Comercial | Após 4,5 s | 90 arquivos · 1.742.391 bytes | 37 arquivos · 724.252 bytes | **−58,43%** |

A redução comprovada está no tráfego de módulos que a pessoa não abriu. O prefetch global foi removido e as seções da Central são carregadas conforme o uso. O custo inicial cresceu um pouco nestes builds de demonstração: há uma nova estrutura de navegação e o ambiente review também contém o novo motor/fixture. Não se afirma que o bundle inicial ficou menor.

## Tempos de laboratório

Valores em milissegundos, mediana de três repetições; mínimo e máximo entre parênteses.

| Medição | Antes | Depois |
|---|---:|---:|
| Entrada em Bancos até conteúdo pronto | 156 (155–258) | 175 (174–243) |
| Entrada em Comercial até conteúdo pronto | 203 (154–211) | 190 (174–198) |
| Clique de Bancos para Comercial após a espera | 128 (120–171) | 140 (134–140) |
| Clique de Comercial para Bancos após a espera | 144 (142–147) | 143 (138–162) |

Os intervalos se sobrepõem e a amostra é pequena. Estes tempos **não comprovam ganho de latência**. O resultado reproduzível é a redução de JavaScript baixado sem necessidade; o localhost é rápido demais para representar uma conexão móvel real.

O clique seguinte também revela a troca envolvida: no código anterior, o prefetch já havia baixado as duas telas. No novo, a primeira navegação de Bancos para Comercial buscou 169.506 bytes adicionais em 17 scripts; de Comercial para Bancos, 37.199 bytes em 4 scripts. É carregamento sob demanda: quem não abre a segunda tela economiza esse download.

O benchmark sintético do motor, realizado separadamente durante o desenvolvimento, está em [Dashboard: fontes e regras](dashboard-fontes.md#desempenho-e-limites). Ele não faz parte destas amostras de navegador e não deve ser somado a elas como previsão de tempo em produção.

## Verificação de integridade associada

A medição não executou gravações nem usou dados de produção. Os testes locais separados verificaram:

- Reconciliação de centavos entre resumo, produtos, clientes, vendedores, séries e detalhes paginados, usando o motor real e exemplos fictícios.
- Carteira restrita, permissões independentes de financeiro/Campanhas e ausência de dados de outra vendedora na resposta.
- Empresa da origem preservada; registros desconhecidos separados dos totais e empresas divergentes excluídas. Número de O.S. repetido entre empresas impede uma associação financeira indevida.
- Leitura com até quatro páginas simultâneas; falha ou limite de segurança gera erro, sem apresentar histórico truncado como completo.
- Diferença entre dado ausente e zero, fonte financeira indisponível, saldo já líquido de pagamentos e rateio por centavos com resíduos exatos.

Os arquivos `tests/comercial-dashboard-audit.test.mjs`, `tests/dashboard-review.test.mjs`, `tests/comercial-dashboard.test.mjs`, `tests/comercial-dashboard-edge.test.mjs` e `tests/comercial-empresa-origem.test.mjs` dão cobertura a esses casos. O checklist geral da entrega registra a rodada final, pois outros testes ainda podem ser adicionados depois desta medição.

## Limites e conferência após publicação

Esta é uma medição controlada de **builds review**, com arquivos e dados fictícios locais. Não representa Core Web Vitals de campo, rede móvel, latência do Supabase, tempo da API Mubisys nem desempenho autenticado em produção. Não houve publicação nesta etapa.

Após a autorização de publicação, conferir o build oficial com a mesma rota e perfil, registrar requisições/bytes e observar a primeira navegação em rede representativa. Separar duração da consulta de dados, tempo de renderização e download de módulos. Comparar consultas com os mesmos filtros e cobertura; não atribuir ao frontend uma melhora causada por bases diferentes.

Para os indicadores reais, a próxima carga precisa preservar a empresa e a grafia deve ser conferida com a origem. O histórico sem identificação continuará parcial ou indisponível até ser confirmado. Unidades, custos, margens e vínculos ausentes não foram inventados para preencher os gráficos.

Artefatos locais da medição: `/tmp/comercial-perf-20261017.mjs` e `/tmp/comercial-perf-resultados-20261017.json`. As duas cópias compiladas ficam em `/tmp/comercial-perf-baseline-20261017` e `/tmp/comercial-perf-novo-20261017`. Esses caminhos são temporários; as tabelas acima preservam o resultado da medição no repositório.
