# ACM Studio — entrega da prévia local

> **Baseline histórico:** este relatório registra a primeira entrega local. A situação atual de estrutura, fixações, Router, Layout 3D e verificações está em [entrega local v2](entrega-v2.md). Evidências e limitações abaixo pertencem à rodada anterior e não devem ser atribuídas automaticamente à v2.

Implementação autorizada para desenvolvimento e conferência local em 17/10/2026. **Não houve publicação, aplicação de SQL no Supabase ou ativação de provedor de IA.** Esta entrega não declara atendimento integral de todos os requisitos da [especificação aprovada](especificacao-aprovada.md).

- Ramo de trabalho: `codex/acm-studio-20261017`.
- Base: `766ecfd`.
- [Abrir a prévia local](http://127.0.0.1:4305/revisao-local.html#/ferramenta-ia?ferramenta=acm), enquanto o servidor de desenvolvimento estiver em execução.
- Dados usados na conferência: estudos fictícios. Nenhum cadastro real de cliente foi incluído nos arquivos do repositório.

## Cobertura da especificação

“Implementado localmente” significa disponível na prévia e sujeito aos limites descritos abaixo. “Preparado” significa código disponível, sem serviço remoto ativado.

| Área do pedido | Situação nesta entrega |
|---|---|
| Integração, fluxo e identidade visual — §§1, 3, 19–20 | Implementado localmente na Ferramenta I.A: etapas de configuração, resumo de quantitativos e pendências, seleção de peças, configurações recolhíveis, desfazer/refazer e alternância entre desenho e formulário no celular. |
| Medidas e superfícies — §4 | Frente, laterais independentes, forro com posição, aberturas retangulares, metros/milímetros e vírgula decimal. O desenho destaca o campo em edição. A referência de origem é informativa: o motor exige medidas externas acabadas já conferidas. |
| Materiais e cores — §§2, 6 | Biblioteca visual de cores/acabamentos, busca, aplicação por projeto/face/peça e comparação lado a lado. Cadastro manual de fabricante/SKU, lote, fonte, aplicação, data e formatos confirmados. Cor na tela não confirma produto, ficha técnica ou estoque. |
| Modulação — §7 | Vertical, horizontal, mista por face e grade manual. Juntas, dimensões preferidas, aviso de faixas estreitas e proteção de geometria das peças. Alterações que invalidam uma peça protegida são expostas. |
| Visualização — §5 | Cena 3D carregada sob demanda, vistas, seleção vinculada, montagem/explosão/peça aberta, espessura, abas, estrutura, transparência, fixações, animação idealizada de dobra, captura PNG e alternativa 2D. |
| Desenvolvimento, usinagem e encapamento — §§8–10 | Abas independentes, recortes/alívios, eixos de canal, compensação por borda, validação das camadas e corte ampliado. Encapamento disponível como estudo nominal separado; não constitui detalhe construtivo aprovado. |
| Estrutura e fixação — §§11–12 | Perfis padrão/personalizado, segmentos, comprimento, corte de barras, sobras e mapas de fita/parafusos por projeto ou peça. Fixações referenciam os apoios gerados. É estrutura desenhada e quantificada, sem dimensionamento estrutural. |
| Chapas e retalhos — §13 | Encaixe conservador de envelopes, refilo, separação de corte, limites da máquina, direção, rotação, material/lote e retalhos. Comparação de alternativas sem aplicação automática. Corte por serra bloqueado por processo ainda não validado. |
| Prioridades e custos — §§13–14 | Quantitativos e orçamento compartilham o mesmo motor entre tela, CSV e caderno. Quatro prioridades de comparação e cotações por material/SKU/lote/formato implementadas e verificadas; ver critérios abaixo. |
| Documentação — §§15–16 | CSV, SVG/DXF em mm, PNG, caderno HTML para impressão/PDF, fichas, planos, mapas de montagem e etiquetas. Caderno pode incorporar a captura 3D da mesma revisão e projeções de estrutura/fixação por face. |
| Calibração — §17 | Registro de corpo de prova com medidas, tolerância, ângulo, responsável, qualidade visual e encaixe. Mudança de configuração invalida a compatibilidade registrada. Sem calibração compatível, documentos continuam identificados como rascunho. |
| Persistência — §19 | Salvamento automático local, recuperação, revisões imutáveis, comparação/restauração, controle de concorrência e importação/exportação JSON. Documentos gerados ficam associados à revisão no navegador. Servidor privado por identidade preparado, ainda não publicado. |
| Assistência — §18 | Interpretação local limitada com proposta de campos e confirmação. Assistente com provedor real preparado, sem modelo padrão, sem chave configurada e sem chamada automática. Não está ativado nesta prévia. |

## Limites de geometria e fabricação

O modelo representa superfícies planas e peças desenvolvidas a partir de módulos retangulares. Aberturas são resolvidas por subdivisão retangular, podendo introduzir juntas adicionais. Não há editor geral de formas livres, entidades completas de letreiros/pilares ou análise tridimensional de todas as interferências.

Os recortes e compensações têm referências explícitas, mas não substituem uma biblioteca de encontros aprovada pela oficina. A animação e o corte ampliado usam geometria idealizada; raio real, transições da ferramenta, fechamento de cantos internos/externos e colisões entre abas precisam de detalhamento e corpo de prova. O estudo de encapamento não recebe liberação de fabricação.

A estrutura é calculada por eixos e apoios gerados pelo modelo. Cargas, vento, substrato, ancoragens, ligações, deduções dos encontros, movimentação térmica e acesso de instalação permanecem pendentes de avaliação técnica. Quantidade de parafusos, metragem de fita e espaçamento de estudo não são indicação de capacidade resistente ou espaçamento seguro. Não foi realizada certificação nem fabricação física nesta entrega.

O encaixe usa envelopes retangulares conservadores; os recortes de canto e a fresagem são operações posteriores. Há comparação de heurísticas, sem promessa de ótimo global ou aproveitamento entre contornos. Não são modelados obstáculos de fixação na mesa nem posições individuais bloqueadas na chapa.

**Serra:** selecionar esse processo bloqueia o plano. A implementação não dispõe de sequência de cortes e recortes de canto validada para o equipamento. A estratégia geométrica denominada guilhotina não equivale, por si só, a um plano operacional de serra.

## Prioridades e custos verificados

Implementadas quatro prioridades sobre nove cenários (três paginações e três larguras): menos chapas, menos emendas, menor custo e composição visual. Emendas usam comprimento compartilhado; composição usa faixas estreitas, desalinhamentos e variação dos módulos. A classificação por custo permanece indisponível quando faltam cotações em qualquer alternativa viável. “Melhor composição visual” é uma comparação por métricas declaradas, não um julgamento estético universal.

As cotações estão vinculadas ao material/SKU/lote e ao formato, para impedir que um preço seja aplicado silenciosamente a outra alternativa. Não há consulta automática a fornecedor. Barras inteiras, perdas/sobras de corte e custo atribuído a retalhos entram no orçamento; preços ausentes permanecem indisponíveis. Processo e serviços ainda podem ser informados como um lote, sem cálculo detalhado de produtividade, transporte ou instalação.

## Documentos e arquivo local

O caderno reúne apresentação, ficha de cada peça, plano das chapas, mapas por face, estrutura, corte das barras, materiais e etiquetas. A imagem incorporada é a **vista 3D do estudo capturada** — montada, explodida ou aberta — vinculada à mesma revisão. O mapa de montagem deriva dos segmentos e fixações do motor; não inventa sequência executiva da obra.

SVG/DXF usam milímetros e camadas separadas para corte, canal, furação, dobra, cotas e identificação. A transformação frente/verso é aplicada ao conjunto das operações. Pontos de parafuso sem diâmetro definido permanecem marcadores; não são convertidos em furos presumidos. Não há G-code ou pós-processador CNC validado. A interoperabilidade com o CAD/CAM e a máquina da oficina ainda exige conferência específica.

O PDF é obtido por **Imprimir → Salvar como PDF** no caderno HTML. A impressão ajusta as ilustrações à página; a escala geométrica 1:1 pertence aos vetores SVG/DXF. A exportação JSON é uma cópia do projeto e também serve à recuperação; não inclui os arquivos já gerados.

Antes de baixar documentos de fabricação, a interface guarda a revisão e arquiva o conteúdo no IndexedDB. Os originais podem ser baixados novamente; conflitos de nome/revisão, corrupção e quota não substituem arquivos anteriores. Limites por identidade: 50 revisões locais, 20 MiB por documento, 100 MiB e 200 documentos no arquivo. A quota efetiva do navegador pode ser menor.

**Esse arquivo é local neste navegador.** Não acompanha a conta em outro dispositivo, não é anexado a um CRM e não constitui backup na nuvem. Limpar os dados do site pode removê-lo. O serviço remoto preparado não armazena esses documentos. O banco versão 2 preserva os rascunhos/revisões da versão 1 ao acrescentar os stores de documentos.

## Privacidade, servidor e IA

A prévia usa identidade isolada de revisão e não envia os projetos à nova API ou ao provedor de IA. O armazenamento local separa identidades, mas não é criptografia no dispositivo nem substitui a proteção da conta do sistema operacional. Downloads contêm os dados do projeto e devem ser tratados como documentos da empresa.

O servidor preparado verifica JWT, expiração, revogação, atividade, senha provisória e permissões atuais. Resolve logins alternativos antes de conferir a conta; o dono vem da sessão, nunca de um campo enviado pelo navegador. O SQL preparado usa isolamento por dono, versões de concorrência, revisões imutáveis, transações e privilégios restritos. Esses controles foram exercitados localmente; a integração com o ambiente publicado ainda não foi ativada.

O assistente remoto exige chave, modelo, tarifas e limites explicitamente configurados. Há teto de entrada, tempo, saída, frequência e orçamento, além de registro de uso sem conteúdo do pedido. Quando habilitado futuramente, o envio dependerá do botão de análise: a descrição e os campos permitidos serão enviados ao provedor. Nome do projeto e histórico não são acrescentados ao contexto automaticamente, mas a própria descrição pode conter informações inseridas pelo usuário. A resposta é uma proposta validada de alterações; não aprova fabricação nem altera o projeto sem confirmação.

Detalhes do contrato, limites e preparação do servidor: [persistencia.md](persistencia.md). O [schema.sql](schema.sql) está preparado e **não aplicado**. Publicação da função, aplicação da migration, configuração de secrets e conferência em produção exigem autorização posterior.

## Evidências de conferência

- Um caderno fictício da revisão R2 foi gerado e baixado pela interface: **438.340 bytes, 32 SVGs e um PNG incorporado**, sem recursos externos. A imagem 3D foi extraída do próprio arquivo e conferida. Isso comprova esse fluxo local, não publicação ou fabricação.
- Foram verificadas no navegador nove condições de recuperação/concorrência de rascunhos e outras 14 de documentos/migração, incluindo preservação exata do envelope anterior, duas conexões concorrentes, isolamento, bloqueio de atualização, nova tentativa e detecção de conteúdo alterado.
- Os testes automatizados abrangem geometria, materiais, frente/verso, camadas/unidades, integridade de revisões, corrupção, limites, texto malicioso, cotações e concorrência. PGlite exercita o SQL preparado e os papéis locais. O provedor de IA dos testes é simulado; não houve consumo em um modelo real.

Rodada final concluída após as correções de cotações, metadados e entrada decimal:

```sh
TZ=UTC node --test src/lib/acm/*.test.mjs src/components/acm/*.test.mjs tests/acm-backend.test.mjs src/lib/calc/*.test.mjs src/lib/ferramentas-ia.test.mjs src/lib/acesso-state.test.mjs
node node_modules/eslint/bin/eslint.js src
node node_modules/vite/bin/vite.js build
git diff --check
```

- **789 testes passaram; zero falhas, cancelamentos ou testes ignorados.**
- Lint: zero erros; um aviso anterior em Agenda.jsx:168, sem relação com ACM.
- Build de produção aprovado. Three.js/cena ficam em chunk sob demanda de 573,54 kB (148,79 kB gzip); o build ainda avisa sobre chunk maior que 500 kB. Não foi escondido nem incorporado ao carregamento inicial do Painel.
- Diff sem erros de espaço/formatação.
- Conferência por navegador: cena WebGL, cores, vista inferior do forro, seleção, dimensões com vírgula, aplicação de alternativa, classificação sem preços completos, serra bloqueada, recuperação, documentos e largura de 390 px. Entrada com separador decimal final confirmada ao sair do campo; Desfazer restituiu a medida anterior.
- Download real do original arquivado confirmado. Paginação final em impressora/PDF e importação em CAD/CAM não foram verificadas nesta entrega.

As revisões encontraram e corrigiram reaproveitamento de cotação de formato antigo, exclusão de cotação que restaurava valor anterior e ausência de campo para material alternativo em largura personalizada. Testes de regressão cobrem esses cenários.

## Evolução futura e aceite técnico

Entre as evoluções previstas no §21 que continuam fora desta prévia estão simulação sobre foto com escala/perspectiva calibradas, biblioteca compartilhada de detalhes construtivos aprovados, leitura de etiquetas e consumo previsto versus realizado.

O fluxo formal com os quatro estados do §17 — rascunho, geometria conferida, fabricação calibrada e revisão liberada — ainda não está completo. O registro de calibração e a identificação dos documentos não equivalem à aprovação formal da revisão. A sincronização dos arquivos gerados também permanece pendente; a associação à revisão exigida no §19 é atendida somente no arquivo local do navegador.

Para uso produtivo, ainda faltam a autorização e a conferência da publicação, validação do processo real da oficina, corpos de prova compatíveis, conferência dos arquivos no CAD/CAM utilizado e avaliação estrutural/fixação conforme a obra. Aprovação de uma amostra, revisão geométrica e liberação de fabricação são etapas distintas.
