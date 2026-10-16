# Newsletter: público, edições, métricas e acervo

Estado: proposta de ampliação, ainda não implementada. Base consultada: 2fa6187, 15/10/2026. Preserva a revisão local de layout.

## Evidências da estrutura atual
- src/pages/Marketing.jsx monta canais por cadastro e preserva links por código.
- src/components/marketing/CanalAberto.jsx oferece Fazer, Resultados, Calendário e Histórico genéricos.
- src/services/marketing.js usa painel-marketing para persistir publicações.
- supabase/functions/_shared/marketing.mjs: prepararPublicacao recebe título, data, URL, canal, ação e números; não armazena corpo de edição nem assinantes.
- supabase/functions/painel-marketing/index.ts: painel consulta publicações dos últimos 400 dias; acesso e escrita passam por papéis do Marketing.

## Estrutura proposta
Newsletter permanece como chip superior. Organização funcional inicial, simplificada pela decisão de interface registrada ao final:

1. Visão geral: tamanho do público ativo, novas inscrições, próxima edição, última edição e resultados disponíveis. Indicadores abrem a lista filtrada. Dado ausente nunca vira zero.
2. Público: nome opcional, e-mail, empresa opcional, origem, data de inscrição, segmentos e situação (pendente de confirmação, inscrito, descadastrado, bloqueado). Busca e lista compacta; cadastro manual e importação CSV com prévia, erros por linha e deduplicação. Registro da autorização/origem. Descadastrados não são reativados por importação.
3. Edições: assunto, prévia do assunto, conteúdo, imagens/links, segmento de destino, responsável, data planejada e revisão. Estados rascunho, em revisão, aprovada, enviada e arquivada. Editar, duplicar, pré-visualizar no celular e consultar versões. Aprovação e agendamento interno não equivalem a envio realizado.
4. Métricas: enviados, entregues, falhas, aberturas únicas, cliques únicos, descadastros e resultados comerciais vinculados por ID quando comprovados. Exibir origem, período, última atualização e cobertura. Taxas têm denominador explícito; sem denominador válido, não calcular. Aberturas são estimativas sujeitas às proteções dos clientes de e-mail. Registros manuais identificados como tal.
5. Acervo: busca permanente por edição, período, tema e situação, com corpo, arquivos autorizados, versão enviada, público agregado e resultados. Paginação independente do limite de 400 dias do painel. Publicação no acervo público é ação separada; o acervo interno não expõe lista de destinatários.

## Captação
Formulário de inscrição reutilizável por link/QR e incorporável no site. Solicitar e-mail, nome opcional e aceite claro; confirmação de inscrição e descadastro pelo provedor escolhido. Proteção contra abuso, limites de requisição e respostas que não revelem se um e-mail já está cadastrado. Captação pública não oferece consultas ao público interno. Instalação no site e disparos dependem de publicação e integração autorizadas.

## Modelo e reaproveitamento
- Assinante com UUID; unicidade de e-mail normalizado no escopo da empresa/lista, sem heurísticas de nomes ou remoção de pontos/aliases.
- Histórico de inscrição e supressão separado do cadastro; autorização e data preservadas.
- Edição com UUID e revisões; versão enviada imutável. Conteúdo estruturado ou sanitizado, sem HTML executável.
- Envio com UUID, edição/revisão, ID do provedor, situação e contagens; idempotência para evitar duplicações.
- Eventos de métricas deduplicados pelo ID do provedor, com origem e data. Autenticar webhooks e não aceitar alteração arbitrária de contadores públicos.
- Vínculo opcional entre edição e publicação genérica pelo ID; sem duplicar a edição para aparecer no Marketing.
- Arquivos privados protegidos; não colocar e-mails reais, anexos ou chaves em repositório público.
- Reutilizar papéis do Marketing, histórico, padrão de formulários e componentes visuais; validar acesso no servidor a assinantes, edição, exportação e anexos. Segregar por empresa se houver múltiplos escopos; não deduzir empresa pelo nome.

## Decisão de integração
Pendente de resposta: plataforma de envio já utilizada. Preferência arquitetural: gestão editorial e acervo no Painel; transporte, descadastro e entrega em provedor especializado. Não construir servidor SMTP próprio. Sem provedor, preparar organização interna e marcar métricas automáticas como não conectadas. Não apresentar campanha como enviada sem confirmação do provedor ou registro manual explicitamente identificado.

## Sequência de execução
1. Validar estrutura e plataforma de envio com o dono.
2. Banco, validações, permissões e testes de servidor para público/edições; migrações somente após autorização de publicação, sem transformar registros atuais silenciosamente.
3. Interface compacta, revisão de edições e acervo persistente; importar apenas dados fictícios nos testes.
4. Integração do provedor, captação, confirmação/descadastro e métricas verificadas em ambiente de teste autorizado.
5. Conferir desktop/celular, falhas e acesso restrito; publicar servidor antes da tela com autorização específica.

## Aceite
- Edição e assinantes persistem após recarregar e em outra sessão autorizada.
- Duplicação de e-mail não duplica destinatário; importação não reativa descadastrado.
- Usuário sem acesso não consulta lista, edição privada, arquivos nem exportação.
- Revisão preserva versão anterior; publicação genérica antiga não perde ID.
- Acervo permite recuperar edições com mais de 400 dias.
- Métricas mostram fonte e não somam eventos duplicados; faltante é diferente de zero.
- Aprovar não dispara e-mail; envio confirmado conserva versão e resultado.
- Build, testes pertinentes e navegação móvel aprovados antes de declarar conclusão.


## Refinamento do dono: simples, moderno e segmentado

Pedido complementar: cadastrar o remetente e operar envios no próprio painel; montar listas por segmentos. Prioridade explícita: tudo muito simples e moderno.

### Interface final proposta
Somente três abas visíveis: Edições, Público e Resultados. Acervo é o filtro Enviadas/Arquivadas dentro de Edições, sem outra área repetida. Configuração do remetente fica na engrenagem, com nome, e-mail de envio, responder para e estado da verificação; credenciais somente em configuração protegida do servidor. Provedor de envio ainda a definir, sem obrigar o operador a sair do painel na rotina.

Edições abre por padrão: lista compacta, assunto, público, data e situação. Botão principal Criar edição. Editor simples em três passos: Conteúdo → Público → Revisar. Prévia de celular/computador, envio de teste e confirmação final. Agendamento só aparece disponível quando houver execução e confirmação reais implementadas. Guardar rascunho automaticamente com aviso de sucesso/erro e controle de versão. Acervo preserva conteúdo enviado imutável.

Público: botão Adicionar contato, Importar planilha e Criar lista. Campos iniciais: nome, e-mail, empresa opcional e segmento; origem/autorização em detalhes. Um cadastro por e-mail e empresa remetente, múltiplas listas/etiquetas, envio único por edição. Descadastro/bloqueio prevalece sobre qualquer seleção de listas. Não compartilhar automaticamente contatos entre empresas do grupo.

### Sugestões de listas para Impresilk
- Segmento: Comércio e lojas; Restaurantes e alimentação; Saúde e clínicas; Construção e imobiliárias; Indústrias; Escolas; Eventos.
- Interesse: Fachadas; Letras luminosas; Comunicação interna; Lonas; Adesivos; Sinalização.
- Relacionamento: Interessados; Clientes; Parceiros. Dados faltantes ficam Não informado, sem classificação adivinhada.
Listas são configuráveis. Começar com listas manuais e etiquetas; filtros salvos por segmento/interesse evitam listas duplicadas. Filtros de comportamento só ficam disponíveis depois da integração correspondente. Sem inferir interesse apenas pela abertura de e-mail.

### Ajuda inteligente sem complicar
Sugestões de assunto e estrutura de texto, modelos reutilizáveis (projeto entregue, dica útil, oferta, novidade) e checagem de links/imagem/descadastro antes de enviar. Conteúdo assistido sempre revisável; sem prometer resultados ou inventar trabalhos, descontos ou estatísticas. Assistência de IA só anunciada como ativa quando integrada e testada.

Resultados: quatro indicadores compactos conforme dados disponíveis (entregues, cliques únicos, descadastros, falhas), comparação por edição e origem visível. Aberturas em detalhe com ressalva de medição. Sem inventar receita atribuída. Cada disparo registra versão do conteúdo, listas escolhidas, público efetivo e retorno do serviço; retentativas não reenviam ao mesmo destinatário.

Design: padrão visual do Painel, três abas fixas, linhas compactas, situações com texto e cor, detalhes recolhíveis, uma ação principal por tela. Sem dashboard gigante ou configurações técnicas espalhadas no fluxo.

Estado deste refinamento: escopo documentado, funcionalidades ainda não implementadas. Não houve importação, disparo ou publicação.

## Estado após implementação local

Gestão de edições, segmentos, contatos, remetente, histórico e resultados manuais implementada. Salvar é explícito. Envio, captação pública, automações e métricas de provedor permanecem pendentes de conexão; não são capacidades concluídas. Consulte docs/newsletter-entrega.md para evidências, uso e implantação.
