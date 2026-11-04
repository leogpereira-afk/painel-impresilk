# Licitações: salvamento seguro, documentos e kits por edital

> Execução local por subagentes, com revisão de integração e verificação antes da entrega. Sem publicação ou commit nesta etapa.

**Objetivo:** corrigir as falhas reproduzidas na auditoria e entregar documentos compactos, download explícito, validades e kit por edital preservando os registros anteriores.
**Arquitetura:** reutilizar acervo documental canônico e acompanhamento existentes. Acrescentar kits privados versionados por edital e titular, contendo requisitos e referências às versões dos documentos. Arquivos continuam no acervo, sem cópias independentes; o ZIP é montado no cliente com índice e bytes autorizados.
**Tecnologia:** React/Vite, APIs existentes de painel-ativos, RPC de compare-and-swap, testes Node e navegador da revisão local.
**Especificação aprovada:** auditoria entregue ao dono em 03/11/2026 e pedido explícito de corrigir salvamentos, documentos/validades/kit e apresentar prévia.

## Restrições

- Somente cópia isolada, dados de ensaio fictícios e nenhuma inscrição, proposta ou cadastro externo.
- Preservar campos desconhecidos, histórico, permissões e todas as alterações anteriores da prévia.
- Nenhuma confirmação silenciosa de validade ou requisito: ausência fica pendente e dispensa exige justificativa.
- Permissões de Licitações e Documentos para kits; documento deve pertencer à empresa titular e ser empresarial. Histórico mantém versão selecionada.
- Erros de rede e conflitos preservam arquivos e rascunhos. Download não indica envio externo nem habilitação.

## 1. Servidor documental e kits

Arquivos: documentos-handler.mjs; novos licitacoes-kits.mjs / licitacoes-kits-handler.mjs; testes documentais/kits. Integração de index.ts pelo responsável do acompanhamento.

- [x] Reproduzir commit confirmado/resposta perdida e revogação durante operação; corrigir sem apagar upload de resultado incerto.
- [x] Revalidar acesso antes de mutação/resposta; garantir erro explícito após revogação.
- [x] Criar coleção privada `licitacoes_kits` via RPC existente, CAS na edição, IDs estáveis na criação.
- [x] Ações `listarKitsLicitacoes`, `salvarKitLicitacoes`, `prepararDownloadKitLicitacoes`; permissão, titular, edital, documentos/versões, faltantes e histórico verificados no servidor.
- [x] Listagem retorna `{ok,itens}`; salvar recebe `{item,versao}` e retorna `{ok,item}`; preparar download recebe `{id,versao}` e retorna `{ok,kit,arquivos,pendencias}`. Cada arquivo: `{documentoId,versaoId?,arquivoId?,nome}`; nenhum caminho interno aceito do cliente.
- [x] Kit: `{id,cadastroId?,nome,licitacaoId,titularId,requisitos:[{id,categoria,descricao,documentoId?,versaoId?,arquivoId?,dispensado,justificativa}],atualizadoEm,historico}`. Snapshot documental resolvido pelo servidor, com datas originais e referência de versão. Não atualizar snapshot de kit antigo silenciosamente ao renovar documento.
- [x] Testar criação/repetição, conflito, documento pessoal/empresa errada, renovação, falta de anexo, kit parcial, revogação e preservação do histórico.

## 2. Acompanhamento seguro

Arquivos: Licitacoes.jsx, PreparacaoLicitacao.jsx, ativos.js, licitacoes-workspace.mjs, painel-ativos/index.ts, mocks e regressões correspondentes.

- [x] Fazer testes falharem para edição concorrente, ação vencida, resposta atrasada e truncamento; corrigir a causa.
- [x] Enviar versão aberta na ficha; rejeitar edição concorrente preservando o formulário e oferecer releitura explícita.
- [x] Vincular resposta à instância de edição; bloquear cancelamento ambíguo durante envio; informar limites sem cortar textos.
- [x] Proteger anexos de editais contra atualização incompleta/compensação não confirmada; manter arquivo anterior recuperável.
- [x] Integrar revalidação documental e novas ações de kits em index.ts, coordenando com servidor documental.
- [x] Passar lista de licitações a Documentos e atalho por edital para abrir seu kit.

## 3. Documentos e experiência compacta

Arquivos: DocumentosLicitacoes.jsx, CSS documental, novo KitsEditalLicitacoes.jsx e serviços/mocks/testes pertinentes; catálogo compartilhado.

- [x] Separar Visualizar/Baixar/Renovar, busca sem acentos, catálogo ampliado, AVCB direcionado ao Patrimônio.
- [x] Recarregar em conflito mantendo rascunho e arquivo; troca de sessão não reaproveita dados antigos.
- [x] Listagem compacta com nome, titular, emissão, validade, responsável e situação; detalhes recolhíveis e ações acessíveis em 390px.
- [x] Criar/editar kit por edital e titular, adicionar requisitos e vincular documentos, marcar não aplicável com motivo, exibir pendências e validades.
- [x] Salvar kit com CAS; download ZIP com índice, documentos selecionados e aviso de pendências. Respeitar limites explícitos de tamanho e abortar pacote incompleto em falha.
- [x] Testar estado de erro, retorno ao kit, versões antigas, direitos e download.

## 4. Integração e conferência

- [x] Implementar utilitário ZIP sem dependência, CRC32, nomes sanitizados e índice UTF-8; validar conteúdo por leitor independente.
- [x] Ajustar Cadastros para recomendações recolhidas, acesso aos documentos e resultados com valor contratado identificado.
- [x] Conferir testes focais, suíte de regressão aplicável, lint e builds oficial/revisão; investigar falhas antes de declarar sucesso.
- [x] Revisão independente dos salvamentos/permissões/kit e da preservação das mudanças anteriores.
- [x] Navegador: salvar, renovar, baixar individual/kit, conferir ZIP e navegação 390/1280px sem cortes; screenshot da prévia final. Conflito concorrente verificado nos ensaios automatizados, sem simular duas sessões produtivas.
- [x] Atualizar VEZ e documentação com verificações e limites; entregar URL de prévia, sem publicação.

Resultado e limites registrados em `docs/licitacoes-documentos-kits-20261104.md`. Prévia local; não publicado.
