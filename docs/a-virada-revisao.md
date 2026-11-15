# A Virada — revisão local

Implementação do acompanhamento de 90 dias dentro do Painel, com o acesso existente. O ambiente de uso começa vazio: data, participantes, acompanhadores e missões são configurados na área protegida. O código público contém apenas cultura institucional e exemplos fictícios.

## Uso

- A direção organiza o ciclo e vincula fichas ativas do RH e seus acompanhadores.
- Cada pessoa acessa seu plano; o acompanhador acessa os planos vinculados a ele. A direção acompanha o conjunto.
- Uma prioridade ativa por pessoa. A missão pode voltar a planejada com motivo quando for necessário reprogramar.
- A evidência registra execução, resultado, aprendizado e referência opcional de O.S. Fotos JPEG, PNG ou WebP ficam privadas, até quatro por relato e seis MiB por arquivo.
- A conferência por outra pessoa confirma 10 XP por missão. Reabrir retira o crédito vigente; validar novamente restaura o mesmo crédito.
- Comentários do plano permanecem reservados. O mural recebe somente resumo e fotos escolhidos por ação explícita.
- A conquista de conhecimento compartilhado exige confirmação do revisor de que houve ensino e demonstração da execução.

Não há sincronização de escrita com Mubisys ou PCP. A referência de O.S. serve ao contexto da evidência. O programa não oferece ranking, remuneração, punição por impedimento nem avaliação automática.

## Revisão sem dados reais

`npm run review`, depois `http://127.0.0.1:5173/revisao-local.html#/virada`.

Perfis opcionais antes do fragmento: `?perfil=virada-lider`, `?perfil=virada-mentor` e `?perfil=virada-sem-acesso`. A demonstração persiste apenas neste navegador. Essa persistência e os nomes fictícios não entram na compilação de produção.

## Verificação

- `npm run test:virada`: calendário no fuso da empresa, cultura, regras, handler, PostgreSQL e backup com dados sintéticos.
- Testes de regressão de backup, arquivos e acessos; suíte geral do projeto.
- Build de produção e lint. Um aviso de hooks preexistente em Agenda.jsx não é desta alteração.
- Navegação local em computador e celular (390 px), sem rolagem horizontal da página. Conferidos formulário de evidência, anexo, ampliação da foto, comentário reservado, validação, XP, publicação do resumo, comentário no mural, cultura, escopo individual, recusa sem permissão e configuração de início futuro.
- Revisão independente do domínio e das recuperações concorrentes corrigiu preservação do prazo original e proteção de fotos já referenciadas.

## Identidade visual aprovada

O módulo acompanha o layout da apresentação: base navy/royal, acentos ciano, magenta e amarelo, Poppins local e Silk em destaque. Planos, mural, cultura, formulários e diálogos usam a mesma linguagem visual. O CSS permanece restrito às classes de A Virada; o shell e as regras de dados e acesso continuam preservados.

Os únicos movimentos contínuos são a flutuação leve do Silk e uma órbita lenta. O botão de efeitos permite pausar e retomar. A preferência de movimento reduzido inicia os efeitos pausados e desativa as animações; os textos permanecem estáticos durante a operação.

Conferência da revisão visual em 15/11/2026:

- Computador em 1440 px e celular em 390 px sem transbordamento horizontal.
- Abas de planos, cultura e mural, diálogo de combinar missão e cancelamento conferidos na prévia.
- Pausa e retomada dos movimentos conferidas no navegador.
- Builds normal e de revisão aprovados; lint focal sem erros; nove testes de helpers e integração passaram.
- Fonte regular incorporada da referência aprovada, sob a licença Poppins já presente no repositório. Nenhum dado pessoal real foi acrescentado.

## Limites da entrega

Não houve publicação, merge, migration produtiva, concessão de acesso nem carga dos planos reais. A comparação de módulos dos três sistemas depende da alteração autorizada em `vida-leo`; o `conferir-sistemas.mjs` não pode ser declarado aprovado antes dessa integração. Os passos estão em `a-virada-publicacao.md`.
