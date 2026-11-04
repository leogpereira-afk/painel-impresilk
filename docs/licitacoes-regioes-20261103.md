# Licitações — regiões e relacionamento

Prévia isolada sobre a organização profissional de Licitações. A base territorial escolhida pelo dono é a lista canônica dos 89 municípios do Norte de Minas. Sem publicação, coleta nova, inscrição em portal externo ou alterações de dados reais.

## Fluxo

- Regiões → Norte de Minas → cidade: oportunidades, órgãos e empresas, pendências.
- Oportunidades agrupadas exclusivamente pelo município de execução confirmado no relatório. Menções a sede e itens retidos permanecem separados. Pesquisa incompleta não vira conclusão de ausência de oportunidades.
- Ficha de órgão/empresa com cidades, endereço, contatos, responsável, próxima ação, prazo, prioridade, exigência de cadastro e vínculos aos cadastros já existentes.
- Cadastros preservam identidade por empresa titular e portal. Validades, exigências e histórico são consultados na origem, sem copiar inscrições. A categoria Empresa privada passa a ser aceita.
- Pendências levam à ficha correspondente. O cadastro vinculado abre na aba Cadastros e permite voltar à cidade; filtrar libera a seleção individual.
- Distância/tempo rodoviários consultados podem ser registrados por cidade, com fonte e data. Rotas externas usam a sede da Impresilk, confirmada no site oficial. Sem endereço de uma entidade, o link é explicitamente uma rota até a cidade. Não há estimativa aérea disfarçada de distância rodoviária nem dependência de API demonstrativa.

## Preservação e acesso

As novas coleções privadas usam a permissão de Licitações e a RPC existente de gravação com comparação integral da versão anterior. Repetições não criam duplicidade. Históricos são gerados no servidor. Vínculos restritos são preservados, mas não expostos. Conflitos mantêm rascunhos para revisão explícita. Arquivamento de entidade é reversível na própria lista.

Fonte pública da origem: https://impresilk.com.br/ — seção Contato, consultada em 03/11/2026. Links de navegação seguem https://developers.google.com/maps/documentation/urls/get-started. O Painel não dispõe de provedor de cálculo rodoviário automático: as distâncias não conferidas aparecem como tal.

## Entrega

Prévia: http://127.0.0.1:8920/revisao-local.html?cenario=licitacoes-workspace#/licitacoes?visao=regioes

Ensaios usam apenas dados fictícios e não são enviados aos sistemas. A demonstração descarta as alterações ao recarregar. Antes de eventual publicação, conciliar a main e a publicação paralela de Documentos/Cadastros, publicar o servidor antes da interface e conferir a versão oficial.

## Verificação

Conferência final de 03/11/2026:

- 262 testes pertinentes aprovados: território, cadastros, entidades, rotas, autenticação, revogação, validação, CAS, corrida, repetição e backup/restauração.
- Suíte geral: 2.075 de 2.077 passaram na sandbox; os dois restantes exigiam porta de loopback (EPERM). O arquivo correspondente foi repetido com permissão de porta e os sete casos passaram.
- Builds de revisão e produção aprovados; ESLint sem erros, apenas aviso preexistente de Agenda. Conferidores de portas, papel e preparação aprovados; diff sem erros de whitespace.
- Navegador: busca sem acento e paginação; cidade, oportunidade, pendência e cadastro vinculado; cadastro e edição de empresa fictícia; rota criada, relida e editada sem duplicação. Campos completos conferidos ao reabrir. Link Google Maps reconheceu a origem e a cidade de destino.
- Telas de 320 e 390 px sem transbordamento horizontal nos fluxos testados; formulário móvel e temas claro/escuro revisados.
- Revisão independente identificou a recuperação após conflito e falha de rede; corrigida com nova leitura dentro do modal. Ensaio isolado React SSR + handlers repetido nos dois formulários: rascunho mantido e nenhuma gravação antes da revisão.

Evidências e scripts de ensaio ficam em /tmp, fora do Git. Nenhum registro produtivo alterado. Distâncias dos 89 municípios não estão preenchidas automaticamente: cada medição consultada deve ser registrada com fonte e data. A prévia começa sem medições e descarta ensaios ao recarregar.
