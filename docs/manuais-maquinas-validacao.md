# Manual de máquinas — implementação e verificação local

24/10/2026. Ramo `codex/manuais-maquinas-20261024`, iniciado em `d8b4c82`. Implementação não publicada; sem migração ou carga de manuais em produção.

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
| Manuais, banco PGlite, interface, RH, fotos, equipamentos e permissões | 66/66 passaram após a revisão visual |
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

## Revisão visual e fotografias

- Navegação por seis áreas com ícones, cor e descrições curtas; orientações e editor recolhíveis; indicadores clicáveis no catálogo.
- Fotografias inteiras com `object-fit: contain`, fundo de destaque e diálogo de ampliação com foco, Escape e retorno ao botão. Temas claro/escuro e largura de 390 px conferidos em navegador.
- Duas referências públicas empacotadas localmente: Roland SG-540 tratada para transparência e Boxer MIGFLEX 250 com transparência original. Proveniência em `src/assets/manuais/README.md`. Só uma URL exata já escolhida e confirmada recebe a imagem local, sem associação por nome.
- Galeria do patrimônio continua prioritária e sujeita à permissão existente. Fonte inacessível mostra aviso; o teste cobre inclusive falha de CSP antes do efeito React. A CSP não foi relaxada.
- A prévia permanece fictícia. Fotografias de referência não comprovam configuração instalada nem homologam operação. Modelos ou fotos não confirmados permanecem explicitamente pendentes no acervo privado.
- Teste de consulta da equipe: foto disponível, última aprovação preservada e nenhum botão de editar/aprovar. Seis seções, filtro de rascunhos, ampliação, formulário móvel e modo escuro conferidos.
- Revisão independente do diff sem achados concretos de regressão em permissões, vínculos por ID, fotos ou navegação. Builds de produção/review concluídos e lint sem erros (aviso anterior em Agenda).

## Cobertura fotográfica — revisão adicional

- Fonte oficial Schulz incluída no resolvedor de imagens por URL exata confirmada. JPG original preservado, sem tratamento generativo; selo de referência do fabricante, nunca foto do bem.
- Acervo real e sua conferência permanecem em entrega privada. A prévia com essas fotos é uma instância local separada, sem incorporar cadastros ou imagens privadas ao build público.
- Nova execução dos testes focados: 67/67 aprovados. Build de produção concluído; lint com zero erros e o mesmo aviso anterior em Agenda. `git diff --check` sem erros.
- Permissões da galeria e vínculos existentes preservados. Nenhum novo manual ou foto foi gravado em produção nesta revisão; nenhuma publicação executada.

## Galeria e consumíveis — fechamento local

- Preferência explícita entre referência e Inventário; novas escolhas respeitam a revisão salva, sem a seleção antiga permanecer por cima. Galeria com miniaturas, navegação anterior/próxima, teclado, ampliação e origem. URLs assinadas continuam transitórias.
- Consumíveis aceitam imagem, legenda, fonte HTTPS e confirmação de uso no contrato validado pelo servidor. Incluir foto não promove compatibilidade. Edição, aprovação, histórico e CAS preservam essas informações.
- Corrigidos o acesso de foto de consumível sem bem vinculado, a edição de referência legada sem fonte e o rótulo do atalho: uma página de peça é “Fonte do fabricante”, nunca presumida como manual técnico.
- Conteúdo técnico privado preparado para a variante confirmada, com referências por página, exemplos históricos identificados e compatibilidades não verificadas pendentes. Roteiros de treinamento são propostas, sem conclusão ou matrícula registrada.
- Conferência nativa: catálogo completo em duas páginas, busca, todas as fotos principais, galeria com original/derivada/referência, Escape e seis ilustrações de consumíveis. Larguras de 319 e 1280 px sem transbordamento horizontal; não equivale a aparelho físico.
- Acervo privado, derivados aceitos e originais conservados fora de src/public/dist. Candidatos com perda de fidelidade excluídos da prévia. A página privada permanece somente leitura e não é distribuída no build.
- Correções pontuais de identificação expressamente solicitadas pelo dono foram efetuadas e relidas na interface publicada, com registros privados antes/depois. Identificações conflitantes não foram substituídas por inferência. A nova interface, os manuais e as fotos continuam sem publicação/carga produtiva.
- Permanece a limitação já registrada da última conferência nativa do PDF. Aprovação operacional exige responsável e validação técnica.

Verificação final desta revisão: **77/77 testes focados passaram**, build de produção concluído, ESLint sem erros (mesmo aviso anterior em Agenda) e `git diff --check` limpo. A suíte geral mencionada acima pertence à etapa inicial e não foi repetida nesta revisão.
