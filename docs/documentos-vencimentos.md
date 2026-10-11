# Documentos e vencimentos

Pedido de 11/10/2026. Menu: Documento & Seguros. Título: Documentos e vencimentos.
Implementação local para revisão. Publicação e migração de registros dependem de autorização específica; nenhuma concessão de acesso foi realizada.

## Leitura e arquitetura

Reutilizar `ativo` para controles documento/seguro/garantia e preservar os registros antigos. Veículos são projeções da ficha física, não novos controles. AVCB é projeção do próprio ativo predial, com o mesmo ID, arquivo e prazo. Anexos novos recebem caminhos imutáveis e versões; renovação nunca sobrescreve o arquivo anterior. Atualizações precisam comparar a versão para recusar conflitos.

Titulares em `documentos_titulares`: `{id,tipo:empresa|pessoa,nome,pessoaId?,atualizadoEm}`. Nenhuma empresa ou pessoa real será semeada. Pessoas do RH são vinculadas pelo UUID, outras pessoas podem ter titular próprio. Empresas Impresilk e Universo são identificadas pelo cadastro confirmado pelo usuário, nunca pela semelhança do nome.

Controles em `ativo`: campos existentes e `titularId,ativoIds,semVencimento,alertaDias,estado,orgaoEmissor,estabelecimento,contato:{nome,telefone,whatsapp,email,endereco},fornecedor,fabricante,compra,tipoGarantia,condicoes,cobertura,obrigacaoPagamento,pagamentoSituacao,acionamentos,versoes`. Metadados internos de arquivos e históricos não são campos editáveis pelo cliente. Valores de seguro desconhecidos permanecem nulos; zero exige informação explícita. Documentos e garantias não recebem valores financeiros por omissão.

Aplicabilidade em `documentos_requisitos`: `{id,titularId,categoria,estabelecimento,documentoId,estado:aplicavel|nao-se-aplica,observacao,atualizadoEm}`. Ligação ao documento por ID, nunca por categoria/nome.

Permissão adicional `documentos-pessoais`, sem concessão automática. Exige Documentos e documentos-pessoais para titulares pessoais e seus controles, incluindo consultas legadas e downloads. Aquisição e NF continuam exigindo inventario-valores. Documentos não expõe dados de Segurança sem a permissão de origem.

## Contrato das ações (painel-ativos)

- `listarDocumentos` -> `{ok,itens,titulares,bens,requisitos}`; bens são projeções mínimas de ativos físicos autorizados; itens incluem AVCB canônico marcado `origem:incendio`; histórico antigo sem titular marcado como pendência, sem inferência.
- `salvarControle` `{item,versao,arquivo?}` -> `{ok,item}`; novo item usa `cadastroId` UUID; edição usa `id` e `versao`; arquivo `{base64,mime,nome}` opcional, preserva versões.
- `renovarControle` `{item,versao,arquivo}` -> `{ok,item}`; preserva versão anterior, arquivo e data; AVCB atualiza a ficha canônica.
- `lerVersaoDocumento` `{id,versaoId?}` -> `{ok,base64,mime,nome}`; sem versaoId lê vigente, incluindo anexo legado/AVCB.
- `removerControle` `{id,versao}`; apenas controles documento/seguro/garantia, nunca ativo físico.
- `lixeiraDocumentos` -> `{ok,itens}` e `restaurarControle` `{id}`; preservam a recuperação existente e controle de acesso.
- `salvarTitular` `{item,versao}` -> `{ok,item}`; IDs gerados pelo cliente, RH validado no servidor; sem apagar titular com registros.
- `salvarRequisito` `{item,versao}` -> `{ok,item}`.
- `previaDocumentos` -> `{ok,somenteLeitura:true,itens:[{id,origem,destino,pendencias}]}`; somente direção, nunca escreve/migra.

## Tarefas e donos

1. Servidor, contratos e testes de handlers: agente documentos_backend. Não alterar UI, permissões nem agenda.
2. Página Ativos, componentes, serviço documentos, cálculos e testes: agente documentos_ui. Não alterar servidor, permissões nem agenda.
3. Permissões, calendário, Home, revisão fictícia e integração: agente principal.
4. Revisão independente do conjunto, build, testes, celular, impressão e verificação de ausência de dados restritos.

## Limites de autorização

Não executar migração de registros, implantar funções, fazer merge/push ou criar registros reais. Ao final entregar revisão local e prévia concreta da migração. O dono autorizou o ajuste pontual de `documentos-pessoais` na equipe-auth do vida-leo. Esse clone contém somente a alteração da lista, sem publicação nem concessão de acesso.

## Fases e resultado local

| Fase | Reaproveitamento e mudança | Verificação | Falta |
| --- | --- | --- | --- |
| 1. Leitura | Ativos, painel-ativos, Patrimônio, incêndio, RH e calendário; bens continuam na origem física | Protocolo e código lidos; build da base aprovado | Nenhum cadastro real de titular confirmado |
| 2. Modelo e permissões | Titulares/requisitos com UUID; documentos-pessoais nas listas; aquisição/NF continuam protegidos; anexos e snapshots imutáveis | Handlers, respostas mínimas, permissões sincronizadas e conflitos em PostgreSQL local | Implantar funções e RPC após autorização |
| 3. Prévia | Ação somente leitura lista origem, destino, ID e pendências; não reclassifica registros | Permissão de direção verificada; nenhuma transformação executada | Se aparecer candidato real, aprovação específica por lista |
| 4. Documentos e Veículos | Controles separados por titular e bem; vários documentos por veículo; pagamento independente; AVCB canônico; renovação preserva arquivos | Renovação, lixeira/restauração, dois controles no mesmo veículo e ficha física preservada | Confirmar no servidor publicado com conta restrita real |
| 5. Garantias e Seguros | Acionamentos, contatos, assistência, arquivos múltiplos; apólice cobre vários bens; início/cancelamento afetam situação | Arquivos múltiplos e garantia sem prazo no navegador; valores ausentes distintos de zero | Cadastros reais feitos pelo operador autorizado |
| 6. Calendário e relatórios | Projeções por ID estável, histórico pessoal restrito, prazos legados preservados, indicadores filtrados, impressão autorizada | Calendário abre o documento pelo ID; perfis restritos; impressão e celular de 390px | Publicação e conferência autenticada real |

## Vínculos e migração

Esta implementação não converte bens físicos em documentos. Prazos explícitos das fichas antigas continuam disponíveis como projeções, até eventual classificação aprovada. Máquinas saem da navegação documental, mas continuam no Patrimônio e em Manutenções; os links antigos exibem a origem preservada.

AVCB usa o registro predial existente: ID, documento vigente, histórico e evento do calendário compartilham a mesma origem. Não há criação documental paralela para AVCB/CLCB.

A alteração SQL preparada (`20261011185909_documentos_versao_retirada.sql`) é estrutural: retirada documental com comparação de versão sob bloqueio. A atualização reutiliza a RPC de gravação já existente. Não semeia titulares, altera cadastros ou migra documentos. Somente serviço autorizado executa as RPCs.

Não foi encontrada no código uma fonte compartilhada comprovada de empresas próprias com UUID. O cadastro de clientes do ERP usa domínio e ID próprios; não equivale automaticamente ao titular Universo. O operador deve confirmar razão social e titular por ID no cadastro documental. Nenhum vínculo foi criado por nome semelhante ou CNPJ presumido.

## Evidência e limites

- Compilação de produção e revisão aprovadas.
- Suíte completa: 1.778 testes aprovados, sem falhas ou casos ignorados, incluindo handlers sintéticos e PostgreSQL local.
- Verificador: 22 permissões idênticas nas três listas.
- Lint sem erros; um aviso anterior em Agenda, fora deste escopo.
- Navegador: tabela compacta de cinco colunas, detalhes recolhíveis e abertura/foco por ID; impressão mantém detalhes completos e todos os bens autorizados de uma apólice; zero explícito do seguro sobrevive a salvar/reabrir; renovação preserva arquivos anteriores; múltiplos anexos; dois controles por veículo; exclusão documental não remove bem; restauração; indicadores seguem filtros; impressão do recorte; agenda abre a origem correta; perfil empresarial não vê documento pessoal.
- Celular: 390px, sem campos/ações fora da largura. A revisão usa somente dados fictícios e o próprio handler documental com banco/storage sintéticos.
- A mudança de usuário ou permissões invalida imediatamente listas, formulários, relatórios e avisos já carregados; respostas atrasadas são descartadas. Registros históricos mantêm o mesmo ID do RH e o nome anterior quando a pessoa foi retirada; novos vínculos inexistentes são recusados.
- A inspeção das respostas restritas ocorreu nos testes de servidor; a conferência autenticada no servidor publicado ainda não ocorreu.
- Avisos são de acompanhamento dentro do painel. Nenhum envio externo de notificação foi implementado ou anunciado.

## Publicação a autorizar

Ordem prevista: RPC estrutural, painel-ativos/painel-agenda/painel-auth, ajuste pontual equipe-auth, tela. Conferir servidor antes da liberação da tela e verificar a versão publicada; preservar os registros e não conceder acessos automaticamente.

## Autorização de publicação

Léo autorizou “pode subir” em 11/10/2026 após a revisão local. Funções e RPC estrutural publicadas e conferidas antes da tela. A alteração estrutural não transformou os registros existentes. Publicação da tela em andamento; validação autenticada com conta restrita real ainda pendente.
