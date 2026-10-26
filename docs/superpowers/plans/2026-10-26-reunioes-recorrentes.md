# Reuniões recorrentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Entregar reuniões recorrentes e únicas com IDs RH, atas e calendário em prévia.
**Architecture:** Reutilizar registros individuais e criar série por lote atômico. Motor puro compartilhado com revisão fictícia; interface modular.
**Tech Stack:** React, Vite, Node tests, Deno/Supabase, PostgreSQL.
**Spec:** docs/superpowers/specs/2026-10-26-reunioes-recorrentes.md

## Global Constraints
Somente dados fictícios; não publicar nem aplicar SQL. Máximo 104 ocorrências, 3 anos, término explícito. Permissões existentes e histórico preservados. IDs de série controlados no servidor. Alterações de grupo atômicas com CAS. Não ampliar escopo de leitura do RH.

### Task 1: Motor e domínio
- [x] Criar supabase/functions/_shared/reunioes-recorrencia.mjs e src/lib/calc/reunioes-recorrencia.test.mjs com as cinco funções do contrato.
- [x] Estender reunioes.mjs com IDs profissionais e ata auditada, preservando campos antigos.
- [x] RED/GREEN: assert.deepEqual(gerarDatasRecorrencia({data:'2026-10-26'}, {frequencia:'semanal',intervalo:1,diasSemana:[1],termino:'quantidade',quantidade:3}), ['2026-10-26','2026-11-02','2026-11-09']); cobrir limites, finais de mês, escopos e conflitos.

### Task 2: Persistência e autorização
- [x] Estender painel-reunioes/index.ts com salvarSerie e demanda, dependências da Task 1.
- [x] Criar migration local da RPC dedicada; testes PGlite para rollback, retry, CAS e acesso service_role.
- [x] Testar endpoint sem sessão/módulo, leitor versus criador, rejeição a vínculo de série injetado e preservação de outras ocorrências.

### Task 3: Interface
- [x] Extrair EditorReuniao para src/components/reunioes, criar programação/ata, consumir motor puro e API salvarSerie.
- [x] Estender busca de ParticipantesReuniao para ID; responsáveis selecionáveis por vínculo.
- [x] Confirmar quantidade/alvos antes de ação coletiva; ações de conversão explícitas sem disparo automático.

### Task 4: Integração e prévia (root)
- [x] Reusar eventos do calendário com série/ID e navegação existente. Revisão simulada usa mesmas funções de domínio, sessionStorage e registros compartilhados para demandas.
- [x] Conferir requisitos/diff, rodar testes e corrigir falhas, build/lint e revisão independente.
- [x] Navegar fluxo completo fictício, reload e celular. Abrir prévia e registrar limitações reais. Sem deploy.
