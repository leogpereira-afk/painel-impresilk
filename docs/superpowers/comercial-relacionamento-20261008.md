# Comercial: prospecção, pós-venda e rotina por cliente

Publicado em 08/10/2026, após autorização expressa do usuário. **Interface e função de dados verificadas em produção**; nenhuma ação fictícia de cliente foi gravada durante a conferência.

## Publicação confirmada

- Código da entrega: `d6f441df4166735a19eaf49eb38d7ec35e1224ac`.
- [Publicação da interface](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/37790259011): build e implantação concluídos com sucesso.
- [Publicação das funções](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/37790258951): concluída com sucesso. A função comercial foi publicada previamente à interface e está ativa na versão 8 após o fluxo automático.
- Os nove arquivos da função publicada correspondem integralmente aos arquivos locais testados. A consulta sem sessão retorna HTTP 401.
- HTML, JavaScript principal, JavaScript e CSS do Comercial servidos pelo site correspondem byte a byte à compilação local.
- Na sessão da direção, foram conferidos a nova aba, busca por nome, busca por CNPJ com pontuação, consulta do histórico e preenchimento automático de cliente, responsável e O.S. pelo atalho de pós-venda. O histórico exibiu também vendas anteriores ao mês selecionado.
- Nenhum erro de execução foi registrado no navegador durante essa conferência. A nova aba ficou aberta para o usuário.
- As suítes foram executadas novamente antes da publicação: 816 testes aprovados, 11 ignorados e nenhuma falha. A gravação de uma ação real e um novo login de consultora não foram executados em produção; esses fluxos seguem cobertos pela validação local descrita abaixo.

[Abrir Prospecção e pós-venda no sistema](https://leogpereira-afk.github.io/painel-impresilk/comercial?aba=relacionamento).

## O que foi implementado

- Aba **Prospecção e pós-venda**, com busca por nome ou CNPJ, responsável, objetivo, estratégia, próxima ação, data, canal, prioridade e andamento.
- Ações de prospecção, pós-venda, relacionamento e reativação. Pós-venda exige vínculo com uma venda acessível à consultora; o histórico de vendas não fica limitado ao mês selecionado no painel.
- Cadastro de prospect dentro da ação quando ainda não existe no ERP, com possibilidade de vínculo posterior ao cadastro oficial. Não cria clientes no ERP.
- Cards compactos com cores e texto de situação, filtros, contagens e consulta às ações concluídas. Conclusão exige resultado; reabertura e reagendamento preservam o histórico.
- Rotina com atrasadas, hoje, sem próxima ação, pendências e relacionamento; funil do ERP consultável em visão própria, sem somar oportunidades como vendas realizadas.
- Atalhos para ações nos clientes, vendas, orçamentos e funil; responsável herdado quando identificado com segurança.
- Briefing no orçamento: objetivo, medidas, ambiente, material, arte, aprovador, instalação, prazo e responsável pela pendência.
- Carteira com filtros para reativação e ausência de retorno; guias de soluções compactos com atalho para planejar a abordagem.
- Metas ausentes e calendário comercial pendente de configuração visíveis; alertas de atualização dos dados, histórico parcial e valores negativos sem alterar os valores importados.
- Layout conferido no computador e em largura de celular de 390 px.

## Dados, acessos e compatibilidade

As ações usam a coleção existente `comercial_acoes` e a gravação existente com controle de versão e histórico. A alteração não requer nova migração SQL. A API valida a titularidade da ação e os vínculos com cliente, orçamento e venda. A busca global retorna somente dados básicos; a consulta de vendas, orçamentos e ações continua restrita ao acesso da pessoa.

Campos adicionais são preservados quando uma tela antiga atualiza uma ação. Erros de gravação mantêm os campos preenchidos. Nenhum envio automático de WhatsApp ou e-mail foi acrescentado.

A busca e validação de CNPJ aceitam o formato numérico e o alfanumérico, segundo a documentação da [Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj).

Base do Painel incorporada por avanço direto até `4ee8eea`, incluindo Demandas e Compromissos. As listas de módulos foram comparadas com `vida-leo` em `e52b568`, usando uma referência temporária somente para leitura; nenhum arquivo desse outro projeto foi alterado.

## Verificação executada

- Suíte principal: 410 testes aprovados, 11 ignorados, nenhuma falha.
- Cálculos e estado de acesso: 406 testes aprovados, nenhuma falha.
- Total: **816 testes aprovados e 11 ignorados**. Os ignorados pertencem a testes SQL de outros módulos que dependem de PGlite indisponível no ambiente.
- Análise estática: nenhum erro; dois avisos já existentes em Agenda e CalendarioEmpresa.
- Compilação de produção e de revisão aprovadas.
- Quinze verificadores aprovados: portas, papel, imports, 404, realizado, acessos, gestão, prioridade de cobrança, fotos, CRM, ações Mubisys, preparação de licitação, restauro, sistemas e classes CSS.
- Navegador: busca, criação, conclusão com resultado, reabertura, reagendamento, briefing de orçamento, vínculo com venda, ação a partir do funil, reativação e guias de soluções conferidos com dados fictícios.
- Layout e formulário sem rolagem horizontal no celular. Após o recarregamento final, nenhum erro de execução observado; permanecem dois avisos do React Router sobre uma futura atualização.
- Diferenças de código conferidas sem erros de espaços em branco.

O ambiente de revisão simula as gravações e as descarta ao recarregar. A persistência real foi revisada no código e exercitada no teste da API, sem gravar registros de teste em produção. Não foi feito novo login de uma consultora em produção para testar a nova versão.

## Revisão e publicação

[Abrir prévia local](http://127.0.0.1:5197/revisao-local.html#/comercial?aba=relacionamento). Requer o servidor de prévia desta sessão em execução. Dados exibidos são fictícios.

A autorização foi recebida e esta sequência foi concluída para a entrega acima. Para futuras publicações:

1. Conferir novamente a base principal e incorporar possíveis alterações simultâneas sem sobrescrever outros trabalhos.
2. Publicar a função `painel-comercial` com seus arquivos compartilhados antes do novo aplicativo.
3. Publicar a interface pelo fluxo existente do projeto.
4. Conferir os arquivos efetivamente servidos, o acesso da direção e de uma consultora e os fluxos de consulta. Qualquer gravação em produção deve ter finalidade real definida pelo usuário.

Os valores das metas e o calendário de trabalho continuam dependendo das informações da direção; não foram inventados nesta entrega.
