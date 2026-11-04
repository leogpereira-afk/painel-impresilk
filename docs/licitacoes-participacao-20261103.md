# Cidades compactas e participação interna

Prévia isolada autorizada em 03/11/2026. O dono confirmou que Participar deve preparar e acompanhar internamente, sem enviar proposta ao órgão.

## Comportamento

- Municípios em linhas compactas, com nome, oportunidades, órgãos/empresas, pendências, distância e rota.
- Cidades com oportunidades validadas e no prazo recebem verde e identificação textual; vêm primeiro, por quantidade, prazo mais próximo e nome. Candidatos retidos não ativam o destaque.
- Participar aparece nas oportunidades da cidade e na pesquisa. Consulta o relatório exato do BotImpresilk no servidor, importa origem e prazo e abre a ficha de acompanhamento com checklist editável.
- A classificação original, exigências completas e condições da preparação permanecem consultáveis. Prazo importado não é apresentado como conferência humana.
- Nova participação requer Licitações e Calendário da empresa. NO-GO, candidato retido e prazo encerrado não criam acompanhamento por esse fluxo.
- Se a ficha já existe, abre a mesma, sem alterar status, anexos, datas ou checklist. Agendar e Participar compartilham identidade e criação atômica. Fichas retiradas não são recriadas por requisição atrasada.

## Limites

O bot disponível pesquisa e publica relatórios. Esta etapa prepara a ficha com seu acervo validado; não executa nova pesquisa nem análise de IA por item. Nenhuma proposta, inscrição ou mensagem é enviada ao órgão. Distâncias continuam sendo registradas com fonte e data, sem estimativas inventadas.

## Verificação local

- 298 testes pertinentes aprovados, cobrindo ordenação, fonte, prazo, permissões, repetição, concorrência, lixeira, preservação e integração com agenda.
- Suíte geral: 2.111 dos 2.113 casos passaram na sandbox; os dois bloqueados pela porta de loopback passaram na repetição autorizada do arquivo, com sete casos aprovados. Sem falha funcional remanescente nessa rodada.
- Builds de produção e revisão aprovados. ESLint sem erros, com aviso preexistente de Agenda; controles de autenticação, escrita e preparação e revisão do diff aprovados.
- PostgreSQL local reproduziu a corrida do gravador genérico e confirmou a proteção da nova RPC.
- Navegador em 1280, 390 e 320 px: linhas, verde, ordem, Participar, formulário, salvamento fictício, retorno à mesma ficha e reconhecimento pelo calendário. Sem transbordamento horizontal nos fluxos conferidos; temas claro e escuro e console sem erros.
- Ensaios usam dados fictícios. A prévia descarta mudanças ao recarregar e não envia registros aos sistemas.

Prévia: http://127.0.0.1:8920/revisao-local.html?cenario=licitacoes-workspace#/licitacoes?visao=regioes

## Publicação futura

Nada publicado ou migrado externamente. Conciliar a main e a publicação paralela de Documentos/Cadastros antes de publicar. Aplicar `20261103235900_licitacao_preparacao_atomica.sql` antes da função `painel-ativos`; publicar também a projeção de prazo importado em `painel-agenda`, depois a interface. Conferir a migração e os contratos servidos antes de habilitar a ação na produção.
