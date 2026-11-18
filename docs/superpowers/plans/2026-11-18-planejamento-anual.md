# Planejamento anual Implementation Plan

**Goal:** Implementar o planejamento anual aprovado com ficha única vinculada ao calendário, pronto para prévia local.
**Architecture:** Domínio puro compartilhado entre servidor e prévia; endpoint próprio de planejamento sobre o armazenamento privado existente; interface acessada por botão do calendário. Importação com conferência, chaves estáveis e persistência atômica.
**Tech Stack:** React 18, Vite 5, Node test, Supabase Edge Functions/Postgres; XLSX via leitor dedicado local.
**Spec:** docs/superpowers/specs/2026-11-18-planejamento-anual.md

## Global Constraints

- Prévia antes de publicação. Nenhum dado real em arquivos públicos, nenhum deploy ou mutação produtiva.
- Botão Planejamento anual no calendário existente; ficha única por ação.
- ID oficial do RH preservado; valores nulos distintos de zero; anexos e histórico preservados.

## Tarefas e responsabilidades

1. Domínio/servidor: `supabase/functions/_shared/planejamento.mjs`, `painel-planejamento/index.ts`, migration de importação atômica, testes `tests/planejamento-dominio.test.mjs` e `tests/planejamento-banco.test.mjs`. Implementar contrato da spec, autorização e diretório mínimo, versão, anexos privados e importação. Começar pelos testes de valores nulo/zero, RH, permissões, calendário, idempotência e conflito; executar com `node --test tests/planejamento-*.test.mjs`.
2. Interface: `src/components/planejamento/PlanejamentoAnual.jsx` e componentes/CSS locais. Props `{sessao,onFechar}`; API `chamarPlanejamento(action,dados)` em `src/services/planejamento.js`. Buscar lista/ator e diretório, renderizar filtros/KPIs, formulário, checklist, arquivos, comentários e histórico. Usar query ano/acao via router. Importador expõe `lerPlanilhaPlanejamento(file)` e `conferirImportacao(acoes,itens)`; integrar conferência antes de chamar importar. Testar erros, read-only, campos e navegação.
3. Importação: `src/lib/planejamento-importacao.mjs`, leitor de XLSX no navegador e testes sintéticos. Exportar `lerPlanilhaPlanejamento(file)` → `{acoes,feriados,avisos}`, `conferirImportacao(acoes,itens)` → `{novas,existentes,alteradas,avisos}`. Chave estável ano+título normalizado; preservar execução nas atualizações. Instalar dependência apenas quando necessária e verificar versão/compatibilidade. Nunca embutir planilha real no repo.
4. Integração e prévia: serviço, adaptador review persistente (IndexedDB), botão e projeções no calendário, export de rota, aviso local e plano de publicação. `node --test tests/planejamento-*.test.mjs`, lint focal, build oficial/review e revisão independente. Abrir local e testar desktop/celular, salvamento/recarga/conflito, anexos e vínculo de calendário.

## Progresso

- [x] Especificação aprovada em chat, protocolo remoto lido e clone isolado criado.
- [x] Domínio/servidor e testes locais, sem migration ou função publicada.
- [x] Interface e integração com a ficha única e projeção no calendário.
- [x] Importação e revisão independente, com correções verificadas.
- [x] Prévia persistente e verificações finais. Evidências em `docs/planejamento-anual-verificacao.md`.
