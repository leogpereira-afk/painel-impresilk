# Manual de máquinas — implementação e verificação local

24/10/2026. Ramo `codex/manuais-maquinas-20261024`, iniciado em `d8b4c82`. Sem publicação, migração ou gravação em produção.

## Entrega

- Botão Manual no cabeçalho de Máquinas e em cada linha; catálogo compacto com busca, situação, categoria e paginação.
- Mesmos IDs de ativos e bens, incluindo máquinas do inventário ainda sem ficha de manutenção. Vínculos ambíguos são recusados.
- Identificação, foto, guia operacional, consumíveis/fontes, assistência, roteiro de treinamento, histórico, impressão e QR local para a ficha autenticada.
- Rascunhos, aprovação e versões preservadas. O leitor recebe a última revisão aprovada; não recebe rascunhos, autores de auditoria ou histórico restrito.
- Responsável selecionado do RH; acesso à Escola por link. Esta entrega não cria matrícula nem registra conclusão na Escola.
- API dedicada no `painel-config`, com projeção fechada do catálogo, validação no servidor e controle de concorrência pela RPC existente.
- Fotografias do inventário mantêm a permissão vigente. A foto de referência tem campo de origem e exige confirmação do direito de uso. URLs assinadas da galeria ficam somente em memória.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Suíte geral `npm test` | 1.402/1.402 passaram |
| Manuais, banco PGlite, interface, RH, fotos, equipamentos e permissões | 63/63 passaram |
| Build de produção | Concluído; aviso de chunks grandes já existentes |
| Build de review | Concluído |
| ESLint em `src` | 0 erros; 1 aviso anterior em Agenda.jsx |
| Conferência das classes de cor | 72/72 presentes no CSS compilado |
| `git diff --check` | Sem erros |

Os testes cobrem acesso anônimo/negado, rascunhos invisíveis ao leitor, ausência de valores e notas fiscais no catálogo, responsáveis do RH, fontes e compatibilidade, criação concorrente, edição concorrente, preservação de histórico e persistência usando a RPC em banco PostgreSQL local. A regressão do token de edição foi reproduzida: formulário aberto na versão anterior não pode assumir silenciosamente uma versão mais recente e sobrescrevê-la.

## Navegador e limites

Na prévia com dados fictícios: busca e filtro de aprovados, leitura de ficha, criação de rascunho, edição, aprovação, consulta de versão anterior, seleção de treinamento, QR e leitor sem edição. Navegação conferida em desktop e largura de 390 px; sem transbordamento horizontal (largura do documento: 381 px). Não equivale a teste em aparelho físico.

O botão de impressão gerou o PDF no diálogo do Chrome. Foi identificado conflito com o A4 horizontal do Patrimônio; o manual ganhou A4 vertical próprio e espaçamento compacto. A segunda conferência mostrou todo o conteúdo em duas páginas e uma folha vazia final. A causa dessa folha foi tratada no CSS (página nomeada no documento, sem troca ao sair da seção, alturas mínimas neutralizadas). O CSS final compilou e passou na conferência de cascata; a última reconferência visual do PDF ficou pendente porque o controle nativo do navegador deixou de responder. Não foi enviado trabalho à impressora.

A prévia usa o handler real com armazenamento em memória: recarregar descarta as mudanças demonstrativas. A persistência real está implementada e testada em banco local, mas só poderá ser confirmada em produção após publicação autorizada do servidor e da interface.

## Acervo e ativação

O levantamento das máquinas e os documentos privados estão fora deste repositório público. A interface de revisão usa exclusivamente exemplos fictícios. Nenhum manual técnico foi homologado para operação e nenhum vínculo do acervo foi aplicado automaticamente.

Antes de disponibilizar conteúdo operacional: resolver as divergências de fabricante/modelo/configuração, conferir fotos e consumíveis, validar o procedimento com responsável técnico e aprovar a revisão. Antes de publicar a interface: publicar e conferir o servidor correspondente, com autorização do dono.
