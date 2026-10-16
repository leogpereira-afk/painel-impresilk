# Newsletter — implementação local, 15/10/2026

## Disponível nesta revisão

- Newsletter no topo, canais fixos em duas fileiras no desktop e grade no celular.
- Edições: assunto, texto de prévia, conteúdo, imagem por URL HTTPS, botão, listas, rascunho/revisão/pronta/arquivada, duplicação, prévia e histórico.
- Público: listas por segmento, contato manual, empresa, origem, autorização e situação; CSV com conferência, limite de 500 linhas e novos contatos pendentes.
- Resultados: números manuais por edição com fonte/data, sem converter ausência em zero.
- Remetente: nome, endereço e resposta; apenas gestão altera. Cadastrar não verifica domínio.
- Publicações anteriores continuam acessíveis em seção recolhida. Não foram migradas ou apagadas.
- Persistência implementada em painel_newsletter, revisões e RPC transacional. IDs UUID, unicidade de e-mail, controle de versão, listas existentes e supressão preservada.
- Edge Function usa autenticação, módulo e papel atuais do Marketing. Tabelas e RPC indisponíveis diretamente a anon/authenticated. Nenhuma nova permissão foi concedida.

## Como usar

1. Público → Criar lista. Escolha os segmentos que fazem sentido para a operação.
2. Adicione contatos ou importe CSV (coluna email obrigatória; nome e empresa opcionais). Um contato pode pertencer a várias listas.
3. Registre origem e autorização antes de marcar como inscrito. Duplicidade não substitui o contato existente; bloqueados e descadastrados não podem ser reativados nesta tela.
4. Edições → Criar edição. Escreva, selecione as listas, confira a prévia e salve. Salvamento é explícito; fechar com alterações pede confirmação.
5. Use Arquivada para o acervo e Histórico de versões para conferir alterações.
6. Se houver relatório de envio externo, registre os números em Revisar → Resultados de envio externo. A aba Resultados identifica esses dados como manuais.

## Limites explícitos

Envio, agendamento, métricas automáticas, link público de inscrição e descadastro público ainda não estão conectados. Nenhum e-mail foi enviado. O endpoint newsletterEnviar recusa disparos. A prévia visual não é prova de compatibilidade com clientes de e-mail.

Para concluir envio: definir provedor e conta, verificar remetente/domínio, implementar fila idempotente e seleção integral do público no servidor, descadastro assinado/supressão e webhooks de entrega, testar em destinatário autorizado e somente então habilitar campanhas. Não guardar credenciais no código ou no campo remetente.

A contagem de público é explicitamente parcial quando há mais de 200 contatos carregados. Listagens têm Carregar mais. Histórico mostra as 50 versões mais recentes; o banco preserva todas.

## Implantação pendente

Não houve publicação, commit remoto ou alteração do banco real. A nova migração cria apenas estrutura, sem converter registros existentes. Com autorização, conferir main/vez e migrações existentes, aplicar a estrutura nova, publicar painel-marketing, verificar acesso e respostas no servidor e só então publicar a interface.

## Evidências locais

Banco PostgreSQL em PGlite: migração, unicidade, versões, histórico, listas válidas, supressão e bloqueio de acesso direto. Endpoint: autenticação, módulo, papel e envio bloqueado. Navegador em simulação: salvar/reabrir edição, prévia, histórico e contato pendente em lista. Largura de 390 px sem rolagem horizontal; desktop 1280 px com duas fileiras. Simulação é volátil e não comprova persistência em produção.

Verificação final: 300 testes de Newsletter/Marketing aprovados com TZ=UTC (padrão do projeto); lint dos arquivos alterados sem mensagens; build de produção e revisão aprovados; git diff --check limpo. A primeira execução sem TZ=UTC teve somente uma divergência de fuso em teste antigo, resolvida executando no ambiente documentado. O controle nativo de data não aceitou o preenchimento pela automação do navegador nesta sessão; a validação de datas/métricas está coberta pelos testes, mas salvar métricas via interface ficou sem comprovação visual.

## Publicação autorizada

O dono autorizou com “subir”. Estrutura criada no Supabase; RLS habilitada e SELECT/EXECUTE negados a anon/authenticated, com acesso de servidor preservado. painel-marketing v51 ACTIVE publicado antes da tela, 12/12 arquivos idênticos à versão validada. Sem envio, contatos reais ou concessão de permissões. Nova verificação local: 33 testes focados, build oficial e verificadores de portas/papel/imports/classes aprovados; lint sem erros (um aviso anterior em Agenda).

**Publicado e conferido:** commit aa8eda3, Pages 38838239958 e Functions 38838239949 aprovados. Versão final painel-marketing v52 ACTIVE, 12/12 arquivos idênticos. Os 121 arquivos públicos conferidos correspondem ao build oficial. Sessão autenticada carregou Edições e Público e abriu Remetente sem erros JavaScript e sem gravar dados reais. A API sem autenticação respondeu 401. Envio continua não conectado. A evidência de tela fica fora do repositório público.
