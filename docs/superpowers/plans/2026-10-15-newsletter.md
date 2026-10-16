# Newsletter Implementation Plan

**Goal:** Newsletter compacta com Edições, Público e Resultados persistidos no servidor.
**Architecture:** Submódulo isolado no Marketing; validação compartilhada, tabela privada com revisões e controle otimista; papéis atuais aplicados na Edge Function. Sem envio até definir/verificar provedor.
**Tech Stack:** React/Vite, Supabase Postgres/Edge, testes Node/PGlite.
**Spec:** docs/superpowers/specs/2026-10-15-newsletter-estrutura.md

- [x] Contrato e banco: contatos únicos, listas por UUID, edições/revisões e remetente; RLS, RPC service_role, conflito e supressão.
- [x] Servidor: leitura paginada, salvar, histórico, validação de público, configuração apenas gestão; sem dados na API pública.
- [x] Tela: três abas, listas compactas, filtros, contato/lista/remetente, editor, prévia, acervo e métricas manuais claramente identificadas.
- [x] Prévia fictícia e testes de validação/banco/servidor; build, lint e UI desktop/celular.
- [x] Entrega: registrar limites de envio/captação pública e necessidade de implantação autorizada. Não executar migração em produção nem enviar mensagens nesta tarefa.
