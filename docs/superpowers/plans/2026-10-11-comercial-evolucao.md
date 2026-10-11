# Evolução do Comercial Impresilk

Goal: entregar as três etapas aprovadas, reaproveitando dados e IDs existentes.
Architecture: cálculos compartilhados puros, ações comerciais canônicas, projeções autorizadas nas agendas e consultas de histórico/PCP sob demanda. Interface compacta nas sete abas atuais.
Tech stack: React/Vite, funções Supabase Deno e testes Node.
Spec: pedido detalhado do dono e auditoria privada de 11/10/2026, com 14 verificações de aceitação.

## Restrições globais
- Desenvolvimento das três etapas autorizado por “Fazer as outras coisas”. Publicação posterior exige autorização específica.
- Não alterar dados reais, conceder permissões, enviar mensagens nem escrever no ERP.
- Preservar histórico, concorrência otimista, escopos de carteira e o atalho do Brief publicado.
- Conteúdo técnico, revisões, entrega e metas ausentes não podem ser inventados.
- Arquivos de teste contêm exclusivamente exemplos fictícios.
- Agentes trabalham em arquivos distintos no mesmo clone; não fazem commits nem publicações independentes.

## Task 1: Registro e rotina diária
Owner: rotina. Files: AcaoComercial.jsx, RotinaComercial.jsx, RelacionamentoComercial.jsx, comercial-relacionamento.css, relacionamento-comercial.mjs, Orcamentos.jsx, testes próprios de contato.
- [x] Modo rápido com resultado padronizado, próximo passo ou espera justificada e data de revisão.
- [x] Campo contatoEm somente após confirmação; edição/reagendamento não registra contato.
- [x] Histórico preservado; confirmação e concorrência existentes reaproveitadas.
- [x] WhatsApp prepara mensagem e nunca grava atendimento ao abrir.
- [x] Fila compacta com motivos, vínculo e ações diretas de orçamento, cliente, contato, retorno e conclusão.
- [x] Pós-venda só com conclusão efetiva; acompanhamento separado dos pedidos em andamento.
- [x] Testar vínculos, resultados, histórico e invariantes de contato.
Interface: helper de validação de contato exportado por relacionamento-comercial.mjs para Task 2. Fila usa campos existentes e novos motivos do cálculo. Root oferece abrirCliente e abrirOrc quando necessário.

## Task 2: Metas e inteligência de cálculo
Owner: cálculos. Files: comercial.mjs, módulos puros próprios e testes comercial/cálculos.
- [x] Metas devolvem participantes, faltantes, excluídos e cobertura, com numerador e denominador alinhados.
- [x] Cobertura incompleta bloqueia percentual definitivo; diferenciar zero, ausente e indisponível.
- [x] Calendário respeita feriados/exceções e comparação explícita por dias úteis.
- [x] Fila preserva pendências fora do período e alertas de validade mesmo com retorno futuro.
- [x] Último contato usa registro confirmado; motivos e ordenação estáveis explicáveis.
- [x] Sugestões de reativação mostram critério e frequência quando houver histórico suficiente.
- [x] Revisões agrupadas somente por ID explícito, sem valores ou tarefas duplicados.
- [x] Integrar helper de contato da Task 1 em validarAcao; testar estados e permissões existentes.
Interface: meta mantém campos anteriores e inclui participantes/faltantes/excluidos/realizado/idsVendas/cobertura. Informar nomes exatos ao root antes de alterar UI. Dados de origem ausentes permanecem ausentes.

## Task 3: Agendas, histórico e operação
Owner: integrações. Files: painel-comercial/index.ts, comercial-contexto.ts, módulos próprios agenda/operação, painel-agenda/index.ts, services/agenda.js, CalendarioEmpresa.jsx, Compromissos.jsx, testes próprios de integração.
- [x] Projetar ações comerciais com o mesmo ID no calendário e compromissos, sob escopo autorizado.
- [x] Edição volta à ação original por deep link; não criar cópias.
- [x] Preservar compromissoId legado e sinalizar vínculo divergente sem migração automática.
- [x] Consulta de cliente sob demanda traz histórico completo autorizado e cobertura explícita.
- [x] Consulta do pedido traz projeção mínima do PCP; estima/confirmada/entrega real distintas.
- [x] Reutilizar fonte financeira e devolver erro de integração distinto de vazio.
- [x] Testes de escopo, entrega versus baixa ERP, identidade e falhas.
Interface: contextoRelacionamento mantém contrato e enriquece vendasCliente; nova consultarPedido recebe ordemId existente. Calendário e Compromissos links /comercial?acao=<id> reutilizam URL. Enviar contrato ao root cedo. Sem novas permissões e sem escrita PCP/ERP.

## Task 4: Apresentação, análises e fichas
Owner: root. Files: Comercial.jsx, comercial.css, novos componentes de consulta, ComercialDicas.jsx, revisão fictícia e documentação.
- [x] Filtros e busca preservados por aba na URL; escopo visível.
- [x] Indicadores abrem exatamente os registros elegíveis e mostram critérios.
- [x] Metas com cobertura, participantes/exclusões e calendário editável.
- [x] Orçamentos compactos com filtros de fase, pendência, próximo passo e validade; revisões explícitas consultáveis.
- [x] Cliente, pedido e checklist consultáveis sob demanda com fonte e atualização.
- [x] Fichas por ID de produto com conteúdo validado ou ausência explícita, perguntas e retorno ao atendimento.
- [x] Comparativos claros, produtos/clientes e recomendações explicáveis.
- [x] Cópia válida preservada e erro visível quando atualização falhar.
- [x] Prévia fictícia desktop/celular cobrindo ações completas e perfis.

## Task 5: Integração e revisão final
Owner: root/revisor independente.
- [x] Revisar escopo e qualidade de cada conjunto; resolver achados.
- [x] Conferir os 14 fluxos de aceitação com dados sintéticos.
- [x] Executar testes pertinentes, suíte de auditoria, lint, build e verificadores oficiais.
- [x] Conferir navegador desktop/390px, filtros, links e contadores.
- [x] Entregar revisão concreta e dependências reais; solicitar aprovação específica só para publicar.

## Estado anterior à autorização de publicação

Fases 1–3 implementadas e verificadas em 11/10/2026. Os dados de demonstração são fictícios. Na entrega local, publicação e validação autenticada ainda dependiam da autorização específica, recebida posteriormente; ambas foram conferidas conforme a seção abaixo. Nenhuma alteração de dados reais foi executada. Dependências de fonte ausente estão explícitas na interface e em docs/comercial-evolucao.md.

### Publicação autorizada e conferida

Léo autorizou “subir” após a entrega local. Código integrado com Compromissos RH, servidor primeiro, depois tela. Pages/Functions da liberação 3894c2a concluídos; 67 arquivos de funções e 114 arquivos da tela idênticos à revisão. Sessão real da Direção conferida sem gravação; testes restritos continuam sintéticos. Registro detalhado em docs/comercial-evolucao.md.
