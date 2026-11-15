# API A Virada (implementação local)

POST `painel-virada`, Bearer do Painel; permissão `virada`, `*` ou direção. O servidor filtra cada resposta e resolve identidade pelo vínculo RH. Sem ciclo, `listar` retorna `{ok:true,ciclo:null,ator,podeConfigurar}`. Não há nova conta/senha.

Todas as mutações recebem `idCiclo` (UUID; criação pode omitir) e `versao` (inteiro, 0 na criação). Retornam `{ok:true,ciclo,ator,podeConfigurar}`. Conflito de versão retorna 409; recarregar antes de reaplicar. IDs novos são gerados no servidor; IDs já existentes são preservados.

- `listar`: sem outros campos; ciclo ativo único, próprio PDI e mentorados, mural compartilhado separado.
- `pessoas`: direção; `{ok:true,pessoas:[{id,nome,funcao}]}` de fichas RH ativas.
- `salvarCiclo`: direção; `item:{nome,inicio:null|'AAAA-MM-DD',participantes:[{id?,rhId,mentorId?,funcao?}]}`. `nome` vem do RH; `funcao` usa o RH por padrão e pode ser ajustada pela direção apenas no programa. Em nova configuração, `mentorId` pode ser o `rhId` de outro participante; resposta sempre normaliza para ID do participante. Participantes com registros não podem ser removidos. `dias` fixo 90.
- `salvarMissao`: direção/mentor do destinatário; `item:{id?,participanteId,titulo,objetivo,tipo:'melhoria'|'aprendizado'|'compromisso',fase:30|60|90,prazo:null|'AAAA-MM-DD',criterio?:string,motivo?:string}`. Missão nasce `planejada`; editar preserva autor/histórico/evidências e não altera status. Uma missão validada deve ser reaberta antes de edição. Alterar prazo, critério ou objetivo exige `item.motivo`; `prazoOriginal` e o diff anterior/novo ficam preservados no histórico.
- `estado`: próprio/mentor/direção; `{missaoId,status:'planejada'|'em_andamento'|'bloqueada'|'em_validacao',motivo?}`. Bloqueio/retorno a planejada exigem motivo; em validação exige evidência com texto e resultado. Validada só muda por `reabrir`. Uma prioridade em andamento/bloqueada/em validação por participante.
- `evidencia`: próprio/mentor/direção; `{missaoId,texto,resultado,aprendizado?,os?}`; somente em missão não validada. Retorna evidência com ID novo. Fotos não são obrigatórias para comprovação textual.
- `anexar`: mesmo escopo; `{missaoId,evidenciaId,nome,mime,base64}`; JPEG/PNG/WebP, assinatura válida, até 6 MiB e 4 fotos/evidência. Base64 puro (sem prefixo data:). Upload privado; arquivo removido se a RPC comprovar rejeição por concorrência. Em resposta de transporte ambígua, o servidor reconfirma o registro antes de decidir: se não puder confirmar, preserva o arquivo privado e registra pendência.
- `comentar`: `{missaoId OU postId,texto}`. Comentário de missão fica privado; comentário de mural fica no mural. Apenas participantes/direção comentam mural.
- `validar`: mentor/direção, nunca o dono do PDI; `{missaoId,parecer,conhecimentoCompartilhado?:boolean}`; requer identidade RH válida do revisor, estado `em_validacao` e evidência textual+resultado. +10 XP derivados da missão validada, nunca por anexar/comentar. `conhecimentoCompartilhado:true` só vale para `aprendizado` e confirma explicitamente que outra pessoa demonstrou o aprendizado; é gravado pelo servidor em `missao.validacao` e `missao.conhecimentoCompartilhado`. Reabrir limpa a confirmação atual, preservando o histórico.
- `reabrir`: mentor/direção, nunca o dono do PDI; `{missaoId,motivo}`; retorna a `em_andamento`, retira os 10 XP derivados, respeita uma prioridade ativa. Histórico preservado.
- `publicar`: próprio/mentor/direção; `{missaoId,titulo,texto,evidenciaIds:[]}`. Cria post separado com resumo e cópias de metadados das fotos selecionadas. Não publica texto de evidência, feedback, PDI nem histórico. Máximo 8 fotos por post; pode publicar resumo sem fotos.
- `foto`: leitura, sem versão; `{idCiclo,missaoId OU postId,arquivoId}`. URL assinada de 300s, só depois de autorizar registro/arquivo. Não aceita caminho de arquivo arbitrário.

Ciclo: `{id,nome,inicio,dias:90,versao,participantes,missoes,mural}`. Participante: `{id,rhId,nome,funcao,mentorId}`. Missão: `{id,participanteId,titulo,objetivo,criterio,tipo,fase,prazo,status,evidencias,comentarios,historico,xp}`. Evidência: `{id,texto,resultado,aprendizado,os,fotos:[{id,nome,mime,tamanho}],autor,em}`. Post: `{id,titulo,texto,fotos,comentarios,autor,em}`. Autor traz usuário/nome/rhId resolvidos pelo servidor. Metadados de fotos devolvidos ao browser não contêm chave do bucket. Ator: `{rhId,participanteId,direcao}`; `podeConfigurar` é somente direção.

Privacidade: permissão `*` não equivale à direção. Conta sem vínculo RH pode configurar só se for direção; nunca validar sem identidade. Participante sem ficha vinculada não recebe PDIs nem mural. Feedback privado não é incluído em posts. Pontos e concessões não são aceitos do cliente. Nenhuma alteração no Mubisys ou PCP.


## PDFs reservados

- `anexarPdi`: somente direção; recebe `idCiclo`, `versao`, `participanteId`, `nome`, `mime:application/pdf` e `base64`. Valida cabeçalho e terminador PDF, tamanho máximo de 6 MiB, participante e concorrência antes do upload. Acrescenta versão, sem substituir arquivos anteriores. SHA-256, ID, caminho, data e autor são calculados no servidor.
- `documentoPdi`: leitura; `{idCiclo,participanteId,arquivoId}`. Somente dono, acompanhador daquele participante ou direção. Retorna `{ok:true,url,nome}` com URL assinada por 300 segundos. Não aceita caminho livre.
- Participantes devolvem `documentos:[{id,nome,mime,tamanho,em,autor}]`, filtrados pelo escopo do PDI. Uma pessoa listada apenas para identificar o acompanhador não expõe os documentos dele.
- Nova migration mantém o bucket privado e acrescenta o MIME PDF aos tipos de imagem existentes.
