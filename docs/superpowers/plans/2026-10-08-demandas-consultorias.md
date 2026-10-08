# Demandas e Consultorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Gerir demandas e consultorias com ID RH, etapas no calendário e contribuição limitada por convite.
**Architecture:** Um contrato puro e uma porta autenticada para os dois tipos; ficha persistida por CAS em painel_registros. Portal restrito por convite com projeção própria. Calendário deriva eventos da ficha, sem duplicação.
**Tech Stack:** React/Vite, Supabase Edge Functions, Postgres, Storage privado, node:test.
**Spec:** docs/superpowers/specs/2026-10-08-demandas-consultorias-design.md

## Global Constraints
- ID RH obrigatório para todos os envolvidos internos; ID externo separado, nunca nome como chave.
- Não alterar RH, PCP, comissões nem eventos existentes.
- Arquivos privados, 5 MB, 20 por ficha; convite de 256 bits, SHA-256, até 30 dias e revogável.
- Backend valida acesso em cada leitura e gravação; calendário respeita o mesmo acesso.
- Não publicar dados fictícios nem enviar mensagens.

### 1. Contrato e persistência
Files: supabase/functions/_shared/processos.mjs; painel-processos/index.ts; src/lib/calc/processos.test.mjs; tests/processos-edge.test.mjs.
Interfaces: prepararProcesso(input,antes,sessao,pessoasRH), agendaProcessos(itens,mes), podeGerir(r,s), podeLer(r,s), projetarConvidado(r,convite), atualizarEtapa(r,input,s), carimbarProcesso(r,s,acao).
- [x] Teste inicial: `assert.throws(()=>prepararProcesso({...base,responsavelRhId:'inexistente'},null,s,rh));` exige ID RH real.
- [x] Testar antes da implementação: `node --test src/lib/calc/processos.test.mjs`.
- [x] Implementar funções puras com listas fechadas, detecção de ciclo DFS, dados canônicos do RH, preservação histórica e versão esperada.
- [x] Porta `listar, pessoas, agenda, obter, salvar, registro, etapa, anexar, arquivo, compartilhar, convidar, revogar`; negar ações fora da lista e qualquer acesso não autorizado antes de projetar dados.
- [x] Testar round-trip, isolamento entre fichas, anexos privados, conflitos e expiracão; commit dos arquivos explicitamente nomeados.

### 2. Tela e calendário
Files: src/pages/Processos.jsx; src/components/processos/*; src/services/processos.js; CalendarioEmpresa.jsx; CalendarioAbas.jsx; CentralShell.jsx; App.jsx.
Interfaces: listarProcessos(tipo), salvarProcesso(item), pessoasProcessos(), agendaProcessos(mes), acaoProcesso(action,dados).
- [x] Criar ficha com formulário RH, setores, análise e etapas; responsável selecionado entre envolvidos; rejeitar remoção ainda usada por uma etapa.
- [x] Criar quadro com filtros e ficha com progresso, anexos, histórico e ações identificadas.
- [x] Integrar prazos e etapas pela resposta `agenda`, com links de volta à ficha e indicação de conclusão.
- [x] Testar build, regras e filtros; revisar desktop e 390 px com dados fictícios.

### 3. Colaboração
Files: src/pages/ColaborarProcesso.jsx; src/services/processos.js; testes do contrato e da porta.
Interfaces: chamarConvite(token,action,dados), criar convite somente por gestor autenticado; revogar por ID.
- [x] Gerar token aleatório, persistir apenas hash e entregar segredo uma vez na resposta autenticada.
- [x] Portal sem login do Painel; token enviado em cabeçalho, removido da barra e guardado só em memória. Sem dados internos/diretório RH.
- [x] Receber comentário, arquivo e andamento; conclusão solicitada vira validação interna.
- [x] Testar token de outra ficha, revogado, vencido, campos forjados, compartilhamento explícito e versão antiga.

### 4. Acessos e entrega
Files: src/lib/modulos.js; painel-auth/index.ts; equipe-auth MODULOS_PAINEL no repositório da Central; documentação operacional.
- [x] Adicionar permissão demandas às três listas, sem conceder a ninguém automaticamente.
- [x] Conferir a base atual da Central antes de preparar sua alteração isolada.
- [x] Rodar testes completos, lint, build, regras de acesso e revisão final do diff.
- [x] Preparar resultado concreto e registrar limites da validação local.
- [ ] Após autorização de publicação: servidor antes da tela e verificação do resultado público.
