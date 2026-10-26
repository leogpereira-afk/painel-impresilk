# Consultorias, Reuniões e Demandas — prévia local

Pedido: administrar pessoas e permissões dentro de Consultorias e melhorar a navegação dos três módulos. Base `d0a9edb8`; ramo `codex/consultorias-gestao-20261026`. Prévia aprovada e publicação autorizada pelo dono em 26/10/2026 ("subir"). Nenhuma alteração de registros ou acessos reais.

## Implementação

- Consultorias: entrada direta em Pessoas e acessos, cartões por consultor, situação/validade, busca e filtros. Cadastro não concede acesso. Emissão exige revisão de pessoa, nível e conteúdo.
- Renovar preserva identidade, nível e link; substituir troca somente o segredo; revogar preserva registros e encerra os filhos do administrador. Prorrogação do administrador não prolonga nem reativa automaticamente sua equipe. Níveis e restrição a uma consultoria continuam validados no servidor.
- Lista de consultorias/demandas: filas de atraso, validação, bloqueios e conclusão, filtros combinados e prioridade por prazo. Etapa pronta não é atraso de execução. Prazo histórico de encerrados é mantido. Consultar a lista não depende de carregar o RH para edição.
- Demandas/etapas: datas reais e progresso seguem as mesmas regras em todos os caminhos de salvamento. Atividade ou avaliação impede retirar a etapa e perder o histórico. Registros legados sem datas não recebem datas inventadas ao editar descrição.
- Navegação: seção da ficha preservada na URL, sem carregar esse detalhe para outros módulos. Uma consulta antiga não sobrescreve a ficha recém-salva.
- Reuniões: Próximas, Aguardando encerramento, Histórico e Todos; filtros por busca, setor, tipo e convites vinculados à conta. Contagens usam o mesmo recorte. Atualização revalida a lista sem substituir um rascunho aberto.

## Verificação realizada

- Rodada final pertinente: **96/96 testes**, zero falhas/ignorados. Inclui autorização, delegação, expiração, substituição, revogação, concorrência, etapas, datas, filtros e reuniões.
- Suíte ampla de cálculos/acessos: **1.436/1.436**. Rodada ampla de `tests/`: 1.758/1.761; dois casos precisavam abrir servidor local e passaram na repetição autorizada (7/7 nesse arquivo). Resta um teste antigo de relógio da Inteligência, descrito abaixo.
- Build de produção aprovado; ESLint dos arquivos alterados sem avisos/erros. ESLint geral: zero erros e um aviso anterior em `Agenda.jsx:168`. Avisos de tamanho de bundle já existentes.
- 14/15 verificadores estáticos do Pages aprovados. O restante usa uma referência local externa antiga, descrita abaixo. `git diff --check` aprovado.
- Chrome, dados fictícios: cadastro, concessão de leitura, limpeza da confirmação ao mudar prazo, renovação, substituição, abertura externa, bloqueio após revogar, renovação preservada ao recarregar a prévia; leitura sem botão de escrita.
- Chrome: reunião encerrada passou para Histórico; etapa sem datas foi recusada; datas confirmadas pelo controle nativo permitiram salvar, proteger a retirada e incluir a demanda na fila Para validar.
- Layout em 390 × 844: Consultorias, Reuniões e Demandas sem transbordamento horizontal; cartões em uma coluna, campos e ações utilizáveis, tema escuro conferido. Sem erros de console nos fluxos testados. É simulação de largura, não teste em aparelho físico.
- Prévia em `http://127.0.0.1:5587/consultorias?processo=consultoria-demo&aba=acesso`; dados de processos/acessos de teste em sessionStorage, isolados por aba. Anexos de teste não sobrevivem à recarga. A persistência produtiva não foi exercitada com escrita real.

## Limitações anteriores, fora desta mudança

1. `tests/inteligencia-importacao.test.mjs`: relógio fictício da VM não alcança o helper importado, que usa a data real. Reproduzido nos quatro arquivos de `origin/main` sem esta implementação: 6/7 passam. Não é evidência de erro de coleta produtiva; código da Inteligência não foi alterado.
2. `conferir-sistemas`: referência local antiga de `vida-leo` diverge em oito verificações. Os seis arquivos do Painel consumidos pelo verificador são idênticos à base. A CI usa checkout atualizado externo; a situação remota não foi inferida dessa cópia local.

## Publicação autorizada

Autorizada após revisão da prévia. Publicar seletivamente `painel-processos` e conferir o conteúdo servido antes do frontend. Não usar o publicador genérico que também republica outros sistemas. Não criar convites reais para testar. Não houve mudança de schema, concessão automática de permissões ou vínculo automático entre reunião e processo.

## Conferência para publicação em 26/10/2026

- Corrigido somente o isolamento do relógio no harness de `inteligencia-importacao.test.mjs`: módulo real e handler compartilham a data fictícia. RED 6/7, GREEN 7/7; código produtivo da Inteligência preservado.
- Suíte raiz completa: **1.763/1.763**, zero falhas/ignorados. Rodada focada independente: **96/96**, lint alterado e diff sem erros.
- Build com `BASE_PATH=/painel-impresilk/` aprovado; 72/72 classes de cor presentes, 131 ações autenticadas e 102 ações de escrita com papel conferido.
- Servidor seletivo `painel-processos` v92 ACTIVE (commit `ee5a4e6`), quatro arquivos relidos iguais à implementação. Consulta sem autenticação continua 401. A validação do restante do Pages será registrada após a execução da CI.

## Publicado e conferido

- Interface `93f6114`, Pages [40359980934](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/40359980934): build e deploy concluídos com sucesso. A integração foi liberada após a leitura confirmada de painel-processos v92.
- CI completa: **1.763 testes raiz, 1.433 cálculos e 7 acessos**, zero falhas. Todos os verificadores estáticos, inclusive a comparação das listas com a referência atual da Central, passaram. Permanece um aviso anterior de lint em Agenda e avisos de tamanho de bundle.
- HTML e oito assets relevantes de entrada, Consultorias, colaboração externa e Reuniões conferidos byte a byte com o build oficial.
- Site autenticado: botão Acessos abre Pessoas e acessos; recarga mantém a seção e a ficha; navegação para Reuniões/Demandas limpa os parâmetros da consultoria. Filas e filtros publicados visíveis; zero erros de console.
- Escritas foram exercitadas somente nos testes e na prévia fictícia. Nenhum registro, convite ou permissão real alterado para conferir a publicação. Evidência e observações sobre registros reais mantidas fora deste repositório público.
