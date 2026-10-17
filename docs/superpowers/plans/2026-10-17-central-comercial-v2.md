# Central Comercial V2: plano de implementação

**Objetivo:** executar o desenho aprovado em `../specs/2026-10-17-central-comercial-v2.md`.
**Arquitetura:** continuar a Central já validada, extrair Resultados e Soluções para componentes focados, agregar séries no servidor e desenhar gráficos SVG acessíveis sem novas dependências. Origem desconhecida não entra em totais Impresilk.
**Stack:** React 18, Router, Vite, lucide-react, SVG/CSS local e Edge Functions existentes.
**Restrições:** só clone fora do iCloud, dados fictícios, permissões preservadas, nenhum deploy ou migração.

## Frentes e interfaces

- [x] Navegação: `CentralComercial.jsx`, `navegacao-comercial.js`, `Glossario.jsx`, `Compromissos.jsx`; mesma tela de Compromissos pelos dois caminhos. Legacy resultados/metas/soluções redirecionados sem perder filtro.
- [x] Extração operacional: `ResultadosComerciais.jsx` recebe `{sessao,filtroInicial,periodo,dashboardDados,modo,onAtualizado}`; lista deriva de `dashboardDetalhe`, financeiro só quando conciliável. `SolucoesComerciais.jsx` preserva catálogo. `Comercial.jsx` mantém quatro abas.
- [x] Séries: motor devolve `series.diaria/mensal/anual`, valores bruto/desconto/líquido, cobertura e datas de cada ponto; comparação traz séries equivalentes. Meta acumulada usa participantes reais e linha de meta mensal sem meta diária inventada.
- [x] Gráficos: `GraficoAnalitico.jsx` oferece toolbar, tabela, ampliação e pontos acessíveis. `GraficosVendas.jsx` agrega controles temporais e meta; `GraficosRankings.jsx` rankings, vendedores e Pareto; `SerieDashboard.jsx` mapa de calor. `DashboardComercial.jsx` integra abas e migrações lazy.
- [x] Verificar cálculo de pontos com lacunas, unidades, comparação e limites; regressões comerciais e navegação; navegador desktop/mobile, teclado, tooltip, expandir, seleção/filtros, vendas/metas e Compromissos; build/lint/checks.
- [x] Conferir visual, documentar fontes/limites e entregar prévia. Nenhum gráfico pode transformar indisponibilidade em zero nem ampliar silenciosamente o período do detalhe.

## Ciclo de verificação

Para cada frente, escrever ou adaptar teste de comportamento, executar antes/depois, revisar o diff e integrar. Correções usam reprodução e regressão específica. Após integrar, executar as suítes pertinentes e a revisão de navegador com rede externa bloqueada. A publicação requer autorização posterior.

## Fechamento local

Implementação e conferência concluídas em 17/10/2026: 1.567 testes gerais, 676 de cálculo/acesso, 35 cenários de navegador, build oficial e 15 verificadores aprovados. Lint sem erros, com um aviso anterior em Agenda.jsx. Limites de fonte e de validação externa documentados em `../../comercial/entrega-central-comercial-v2.md`. Publicação ainda não autorizada para esta revisão.
