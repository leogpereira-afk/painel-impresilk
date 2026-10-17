# Central Comercial — plano de implementação

**Objetivo:** executar o desenho aprovado em specs/2026-10-17-central-comercial.md com fontes e permissões preservadas.
**Arquitetura:** shell navegável pela URL, telas lazy e independentes, consultas de agregação no servidor e detalhes paginados. Reutilizar o Comercial operacional. Dashboard usa dados comerciais autorizados, sem transformar faturamento em venda.
**Stack:** React 18, React Router, Vite, CSS com tokens locais, Edge Functions existentes e funções puras testáveis.

## Entregas
- [x] Navegação: CentralComercial.jsx, App.jsx, Layout/sidebar e testes. Seções por URL; links legados e acesso parcial preservados; montar apenas seção ativa.
- [x] Fontes e cálculos: comercial-dashboard.mjs, comercial-dashboard-consulta.ts e ações em painel-comercial. Ler com escopo, agregar histórico, filtros e comparação; validar totais, deduplicação, data comercial, ABC e unidade.
- [x] DashboardComercial.jsx e componentes: indicadores compactos, tabela paginada, séries, matriz histórica, detalhe, filtros e inteligência com evidências. Ausência de dado exibida como indisponível.
- [x] Desempenho: medir build/base e navegação; carregamento lazy, cancelamento e cache de leitura isolado por sessão; sem pré-carregar histórico oculto.
- [x] Verificação: testes puros/porta/URLs/permissões, fluxo browser com fixtures, mobile, build/lint/checks. Revisão independente da implementação e das limitações.

Resultado local e limitações: [entrega-central-comercial.md](../../comercial/entrega-central-comercial.md). Publicação não realizada. Recursos que exigem custos, unidades ou vínculos ausentes permanecem indisponíveis; não foram fabricados dados para preencher as análises.

## Contratos e decisões
1. O acesso à Central não concede permissões aos módulos filhos. A entrada mantém disponíveis as ferramentas autorizadas mesmo sem acesso ao Comercial.
2. Dashboard recebe somente dados autorizados, agrega no servidor e consulta registros de detalhe em páginas. Filtros e cobertura viajam na resposta.
3. Fontes incompletas ou sem identificação confiável permanecem sinalizadas. Quantidade agrega por unidade. Custos/margem e similaridade dependem de fonte comprovada.
4. A prévia usa dados fictícios, será apresentada antes da entrega completa. Publicação permanece separada e depende de autorização específica.
5. Ações sugeridas nunca disparam contatos ou alteram cadastros automaticamente.
