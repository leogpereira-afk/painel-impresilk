# Modelos LED reais para Letra Caixa — pesquisa de 17/10/2026

Escopo: catálogo técnico de referência. Não comprova estoque, distribuição no Brasil, preço, compatibilidade final da fonte ou liberação de fabricação.

## Catálogo inicial

Fabricante: **Principal Sloan**. Família: **Qwik Mod 12V Gen 2**. Variantes selecionadas: branco **6500 K**, **12 VDC**, **IP67**. Dimensões abaixo em milímetros, convertidas das polegadas publicadas (`1 in = 25,4 mm`).

| Perfil | SKU exato | Potência por módulo | Comprimento × largura × altura | Máximo de módulos no ramal encadeado | Capacidade publicada para fonte de 60 W |
|---|---|---:|---|---:|---:|
| Small | M-QMG2S-12-65 | 0,74 W | 53,848 × 16,002 × 11,938 mm | 40 | 80 |
| Medium | M-QMG2M-12-65 | 0,90 W | 53,848 × 16,002 × 11,938 mm | 30 | 60 |
| Large | M-QMG2L-12-65 | 1,25 W | 77,9018 × 16,002 × 11,938 mm | 24 | 48 |

Fonte: [ficha técnica Qwik Mod 12V Gen 2, revisão F, 12/10/2026, páginas 1–2](https://principalsloan.com/uploads/qwik-mod-12v-gen-2-datasheet.pdf). A leitura direta do PDF está mais atual que o resultado indexado da busca, que ainda exibia a revisão B com dimensões anteriores e Large de 1,19 W. O catálogo deve registrar a revisão F.

A ficha informa polaridade branco sólido positivo e branco com faixa preta negativo para essas variantes. Não foi localizado um número confiável de chips por módulo; contar **módulos LED**, sem inventar quantidade de diodos.

## Distribuição óptica

A tabela oficial de densidade fornece referências por profundidade, não uma malha universal. Valores convertidos abaixo. Passo longitudinal calculado por `304,8 / módulos por pé`.

| Perfil | Profundidade | Passo longitudinal | Traço máximo, uma fileira | Distância entre centros de fileiras |
|---|---:|---:|---:|---:|
| Small | 50,8 mm | 76,2 mm | 127 mm | 76,2 mm |
| Small | 76,2 mm | 152,4 mm | 203,2 mm | 152,4 mm |
| Small | 101,6 mm | 203,2 mm | 304,8 mm | 254 mm |
| Small | 127 mm | 203,2 mm | 355,6 mm | 304,8 mm |
| Medium | 101,6 mm | 203,2 mm | 304,8 mm | 254 mm |
| Medium | 127 mm | 203,2 mm | 406,4 mm | 330,2 mm* |
| Medium | 152,4 mm | 203,2 mm | 457,2 mm | 406,4 mm* |
| Large | 101,6 mm | 225,778 mm | 254 mm | 203,2 mm |
| Large | 127 mm | 225,778 mm | 355,6 mm | 304,8 mm |
| Large | 152,4 mm | 225,778 mm | 457,2 mm | 355,6 mm* |
| Large | 177,8 mm | 225,778 mm | 558,8 mm | 406,4 mm* |
| Large | 203,2 mm | 225,778 mm | 609,6 mm | 457,2 mm* |

`*` O fabricante indica 304,8 mm entre fileiras para máxima luminosidade.

Fonte: [Channel Letter Density Guidelines, revisão D, 09/03/2026, página 2](https://principalsloan.com/uploads/principal-sloan-channel-letter-density-guidelines.pdf). Os valores conferem com a tabela da ficha Gen 2 atual.

**Aplicação no simulador:** mostrar essas linhas como referências consultáveis, mantendo profundidade e perfil associados. Não interpolar profundidades, transformar largura de traço em espaçamento entre fileiras nem declarar uniformidade óptica garantida. Profundidade externa da caixa pode diferir da distância LED–face. Acrílico, espessura, pigmentação, película, interior e geometria da letra alteram o resultado; a combinação precisa de amostra física. A ficha Gen 2 atual não documenta todos esses condicionantes de ensaio.

## Ramais, fontes e fios

1. **Ramal e fonte são limites distintos.** Os valores 40/30/24 pertencem à cadeia de módulos; 80/60/48 pertencem à tabela de capacidade da fonte de 60 W. Uma fonte pode alimentar mais de um ramal. O desenho deve apresentar positivos e negativos correspondentes, sem tratar o encadeamento físico como soma de tensões dos módulos.
2. **Capacidade de catálogo não substitui a fonte escolhida.** Recalcular potência/corrente disponível com a ficha da fonte, margem configurada, temperatura e limites de saída. Não liberar qualquer fonte de 60 W só porque possui a mesma potência nominal.
3. **Comprimento do fio entre módulos:** a ficha Gen 2 informa 1,5 módulo/pé para Small e Medium e 1,35 para Large. Isso equivale a uma cadência nominal de 203,2 e 225,778 mm; não informa o comprimento livre garantido de cada par de fios, tolerância ou reserva para curvas. A geração anterior usava explicitamente o termo “fully-stretched”; esse esclarecimento não aparece na revisão F consultada. Não transferir a garantia da geração anterior.
4. **Consequência prática:** não assumir que qualquer ligação desenhada entre centros usa o fio de fábrica. Rotas maiores, mudanças de fileira e passagens entre letras podem exigir extensão/emenda. Separar cabo externo calculado, fio pré-instalado nos módulos e extensões ainda não confirmadas; não descontar o fio de fábrica automaticamente do quantitativo comprado.
5. **Quantidade elétrica:** usar módulos efetivamente posicionados: `P = N × W_módulo`, `I = P / 12`. Com 100 Small, por exemplo, a potência nominal calculada é 74 W e a corrente nominal é aproximadamente 6,167 A. São cálculos de referência, sem perdas da fonte, condições térmicas ou aprovação elétrica.
6. **Quantidade de fio:** diferenciar metros de percurso de cabo bipolar e metros totais de condutores (+ e −). Documentar ida/retorno, folga e caminho assumidos; a fiação AC e a passagem real na parede permanecem um escopo separado quando não cadastradas.

O [guia oficial de retrofit de gabinetes e letras, revisão B, 19/06/2024](https://principalsloan.com/uploads/principal-sloan-cabinet-channel-letter-retrofit-guide.pdf) ilustra ramais paralelos e separa primário e secundário. Ele contém modelos antigos na lista do kit: não usá-lo como prova de certificação da combinação Gen 2 com outra fonte, nem importar seus limites de cabos para qualquer instalação.

## Atualidade e limites

O fabricante anunciou em 21/09/2026 transição de **SKUs selecionados** Prism12/Prism24, incluindo famílias Mini e Nano+, para gerações atuais. Por isso este catálogo inicial usa Qwik Mod Gen 2; o anúncio não comprova indisponibilidade de toda variante nem estoque no Brasil. [Comunicado oficial de transição](https://principalsloan.com/news/product-update-select-prism12-and-prism24-skus-transitioning-to-replacement-skus/).

Pendências antes de fabricação: fornecedor/modelo recebido, instrução de instalação aplicável, condições térmicas, material de face, distância LED–face, cabo e conectores reais, extensão entre módulos e ensaio de uniformidade. Nenhuma fonte consultada autoriza inferir preço, disponibilidade, seção de cabo universal ou aprovação estrutural/elétrica do letreiro.
