# Pintura e elétrica — implementação local

APIs em `src/lib/letras/finishing.mjs` e `electrical.mjs`. Sem valores técnicos de fabricante pré-cadastrados. `createPainting()` gera camadas preparação/primer/tinta/verniz, todas a definir; `calculatePainting(value, areaMm2, now)` retorna área, camadas, consumo teórico, consumo com perda quando explicitada, tempos decorridos/janela, errors/pending e released. `createElectrical()` gera arrays vazios models/modules/supplies/circuits/segments; `calculateElectrical(value)` retorna circuitos, trechos, totais, errors/pending, approved sempre false.

## Cobertura

- Pintura parcial: seleção e dispensa justificada por camada, fabricante/SKU/ficha, cor física e brilho distintos, rendimento por demão/sistema, perda explícita, proporção em massa/volume sem conversão, vida útil, tempos separados e janela de repintura. Condições e compatibilidade são confirmações explícitas. Seleção de produto não inicia aplicação. Tempo decorrido nunca confirma cura/liberação.
- Elétrica parcial: módulos por ID/modelo/circuito, potência sem dupla multiplicação, corrente por tensão constante, limite de módulos/ramal, incompatibilidade de tensão, capacidade utilizável por fonte e soma de circuitos da mesma fonte. Capacidade utilizável é entrada documentada, sem margem universal.
- Trechos parcial: origem/destino, corrente do trecho, resistência documentada por metro, comprimento ida ou ida+retorno, queda I×R, cabo multipolar e condutores distintos. Um registro é um trecho físico; duplicidade de IDs é erro.
- Cards React compactos: PaintingCards({value,onChange,areaMm2}), ElectricalCards({value,onChange,enabled}), FixingCards({value,onChange}). Edição real de objetos, details recolhíveis, labels, foco, uma coluna em celular. ElectricalCards desativado não gera dados.
- Fixação apenas cadastro preliminar: métodos letra–parede e face–corpo independentes, substrato/revestimento, pontos e afastamento. Alteração invalida confirmação. Sem cálculo estrutural ou liberação.

## Limites explícitos

Não há catálogo real, ficha técnica carregada, comparação automática de condições por temperatura/umidade, aplicação seletiva por superfície na UI, orçamento de embalagens/sobra, ciclo de pó, workflow de inspeção nem proposta de compatibilidade química. Área é a informada pelo chamador. Campos datasheet são referência manual, não evidência verificada externamente.

A elétrica não distribui módulos geometricamente, não propõe posição/bitola, não simula óptica ou projeto de rede, não soma queda por caminhos completos, não deduz correntes a jusante nem valida conectores/ambiente. Corrente constante não implementada. Rede/percursos complexos e trechos compartilhados precisam cadastro e revisão próprios. Declara pendência permanente e não aprova dimensionamento. Posição/caminho geométrico editável ainda pendente.

## Verificação atual

17/10/2026: primeiro teste falhou por módulos ainda ausentes (fase vermelha); após implementação, `node --test src/lib/letras/technical.test.mjs`: 9 testes, 9 aprovados, zero falhas. Cobrem consumo conhecido e base sistema, cura não automática, mistura vencida, repintura vencida/condicionada, entradas negativas, potência/corrente conhecida, retorno, cabo bipolar, sobrecarga agregada, tensão incompatível, módulo sem circuito, modelo incompleto e ID duplicado. ESLint focado nos dois módulos, testes e TechnicalCards.jsx: saída zero. Verificação visual integrada/build geral sob responsabilidade da integração da página.

## Correções da revisão independente

Reproduzidos com falha antes da correção os três casos técnicos do relatório de revisão: listas com null lançavam TypeError antes de validar o elemento; released por camada consultava somente pendências, ignorando erros locais; potência agregada percorria apenas circuitos e omitia módulo órfão. Adicionados validadores de forma antes de calcular/renderizar, erro local bloqueando liberação e associação incompleta produzindo potência null.

`validatePainting(value)` e `validateElectrical(value)` retornam arrays de erros estruturais. `validateTechnicalProject(project)` exportado de finishing.mjs permite à importação rejeitar o projeto inteiro antes de substituir o estado; campos técnicos ausentes continuam permitidos para projetos anteriores. Validadores verificam objetos/listas/elementos, campos escalares e estruturas mix/times antes de uso. Calculadores retornam saída vazia com errors para forma malformada, sem cálculo parcial. Cards apresentam esses erros sem percorrer os dados inválidos.

Verificação posterior: 12 testes aprovados, zero falhas; ESLint dos dois módulos, teste e TechnicalCards.jsx sem erros. Incluídos null, lista substituída por objeto, proporções inválidas na forma, objeto como potência, tempo técnico negativo com releaseConfirmed e módulo sem circuito. Sem alterações na página raiz.

## Usabilidade antes da prévia

ElectricalCards agora usa seletores de modelo/circuito/fonte com nome/SKU e ID legível; preserva referência ausente como pendência visível em vez de trocar silenciosamente. Novos registros usam MODELO-01, LED-01, FONTE-01, CIRCUITO-01, CABO-01 com conferência de unicidade. Nome opcional pode identificar os registros. Cadastro continua módulo a módulo, sem prometer distribuição automática.

PaintingCards recebe components e exige seleção explícita em painting.surfaces (lista de IDs), com área nominal de cada componente visível. Sem seleção, área pintada/consumo ficam pendentes; nenhuma face acrílica é selecionada automaticamente. A área global de todos os componentes não é aplicada à pintura. Seleção alterada invalida conferência das camadas. Distinção por faces/bordas dentro de um mesmo componente permanece pendente e é declarada na UI. Integração deve calcular a área dos mesmos IDs para documentos.

Verificação atualizada: 13 testes técnicos aprovados e lint focado sem erros. Prévia visual fica para verificação integrada da página.
