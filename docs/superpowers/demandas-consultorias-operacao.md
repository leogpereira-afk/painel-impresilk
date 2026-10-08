# Demandas e consultorias · entrega para revisão

Implementação local de 08/10/2026. Ainda não publicada.

## Uso
1. Calendário → Demandas para problemas internos; Consultorias para trabalhos com uma empresa/profissional.
2. Nova ficha: título, objetivo, setor, prioridade e prazo geral. Na consultoria, identificar empresa/profissional e especialidade.
3. Selecionar envolvidos no cadastro do RH e um responsável. O vínculo é o ID do RH, sem associação por nome.
4. Adicionar etapas: o que fazer, responsável do RH, prazo e dependências. Dependências circulares são recusadas. Não é possível iniciar/concluir antes das predecessoras.
5. Salvar: o prazo geral e os prazos das etapas entram no Calendário da empresa para as pessoas autorizadas. Alterar a data move o evento; não cria cópia.
6. Usar registros e arquivos para reunir evidências e decisões. A análise permanece interna.
7. Nas consultorias, abrir Links de colaboração. Escolher uma pessoa do RH ou informar um consultor externo. Revisar o conteúdo compartilhado e criar um convite de até 30 dias.
8. Copiar o link e enviá-lo ao convidado. Nenhuma mensagem é enviada automaticamente.
9. O consultor acompanha objetivo, solução, etapas e materiais liberados; acrescenta registros/arquivos e informa andamento. Ao terminar, envia a etapa para validação. A conclusão é interna.
10. Revogar um convite no painel encerra futuras consultas e contribuições. Arquivos com URL assinada já aberta podem permanecer acessíveis até o vencimento de cinco minutos.

## Acesso e limites
- Permissão `demandas` abrange Demandas e Consultorias, sem concessões automáticas.
- Direção master, criador e responsável administram a ficha. Demais envolvidos podem consultar, comentar, anexar e atualizar suas próprias etapas.
- A pessoa precisa ter a conta ligada ao ID do RH em Sistemas e configurações. Nome igual não concede acesso. Vínculo ambíguo não é aceito.
- O Calendário da empresa mantém sua própria permissão de consulta; prazos só são acrescentados se também houver acesso a Demandas e vínculo com o processo.
- Consultor externo recebe ID de convite próprio, separado do RH. Link é uma credencial transferível: o nome exibido identifica o convite e não comprova identidade.
- Convite é restrito a uma única consultoria. O servidor guarda somente o hash do segredo; não é possível recuperar o link integral depois.
- Não disponibiliza diretório do RH, análise interna, histórico administrativo nem arquivos internos ao visitante.
- Até 150 envolvidos, 100 etapas, 20 arquivos de até 5 MB e 100 convites por processo. PDF, JPG/PNG/WEBP, DOCX, XLSX e PPTX.
- Gravação concorrente exige recarregar, sem sobrescrever outra versão silenciosamente.
- Cancelamento preserva a ficha e retira prazos do calendário. Não há exclusão permanente.

## Verificações
- Suíte integrada: 803 testes, 792 aprovados, 11 ignorados por configuração existente, nenhum erro.
- Inclui 14 testes novos de RH canônico, autorização, token, expiração, revogação, projeção externa, dependências, CAS e limpeza de upload em conflito.
- As 15 verificações estáticas do projeto passaram, inclusive os 19 módulos presentes nas três listas de acesso.
- Build de produção e lint: verificar evidência final no registro de entrega; os avisos de hooks em Agenda e CalendarioEmpresa são anteriores a esta alteração.
- Chrome local: editar participantes; mudar data pelo teclado e conferir no calendário; navegar pelas novas abas; portal externo solicita validação e anexa arquivo fictício.
- Portal em 390 px sem transbordamento horizontal; nenhuma mensagem de erro de console observada.
- Somente dados fictícios na prévia. Nenhuma ficha real, convite real, arquivo real ou cadastro de RH foi alterado.

## Publicação pendente
Repositórios preparados:
- Painel: `painel-demandas-20261008`, ramo `codex/demandas-consultorias-20261008`.
- Central: `vida-leo-demandas-20261008`, ramo `codex/demandas-permissoes-20261008`, única mudança em MODULOS_PAINEL do equipe-auth.

Ordem: conferir bases remotas → publicar/validar equipe-auth com a nova permissão → painel-processos e painel-auth → interface → verificar assets e navegação pública. Não conceder permissões a pessoas nem criar convites de teste em produção automaticamente. O workflow atual de funções publica também funções do PCP: revisar o escopo ou usar publicação seletiva.
