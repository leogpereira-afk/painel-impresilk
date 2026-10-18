# Fontes e fios — referências para Letra Caixa v4

Consulta: 17/10/2026. Dados de fabricantes; pesquisa para cadastro técnico e estimativa, sem verificação de estoque, preço, autenticidade do item adquirido ou aprovação de instalação. Os componentes abaixo são reais; uma combinação calculada continua sendo estudo até a conferência do responsável.

## Fontes de tensão constante

### MEAN WELL LPV-60

| Modelo exato | Saída DC | Corrente nominal | Potência nominal |
| --- | ---: | ---: | ---: |
| LPV-60-12 | 12 V | 5 A | 60 W |
| LPV-60-24 | 24 V | 2,5 A | 60 W |

Entrada: 90–264 V AC, 47–63 Hz. Dimensões: 162,5 × 42,5 × 32 mm. IP67, caixa plástica isolada, classe II sem FG. Faixa ambiente: −30 a +70 °C, sujeita à curva de redução de carga. Referência de medição: 230 V AC, carga nominal, 25 °C. Instalação externa sem sol direto; observar manual de vedação. A ficha requer avaliar redução por tensão de entrada baixa, temperatura, orientação e altitude. Não presumir potência integral em toda a faixa ambiental.

Uma saída física: positivo vermelho e negativo preto. Entrada indicada: L marrom/N azul. Rabichos de 600 ± 30 mm. Conferir marcação do exemplar antes de instalar.

Fonte: [ficha LPV-60, revisão 2026-09-07, páginas 1–2](https://www.meanwell.com/Upload/PDF/LPV-60/LPV-60-SPEC.PDF).

### MEAN WELL LPV-100

| Modelo exato | Saída DC | Corrente nominal | Potência nominal |
| --- | ---: | ---: | ---: |
| LPV-100-12 | 12 V | 8,5 A | **102 W** |
| LPV-100-24 | 24 V | 4,2 A | **100,8 W** |

Entrada: 90–264 V AC, 47–63 Hz. Dimensões: 190 × 52 × 37 mm. IP67, caixa plástica isolada. Ambiente: −25 a +70 °C, com redução de carga conforme curva. Condições de referência: 230 V AC, carga nominal, 25 °C. Uso externo sem sol direto. Avaliar orientação, temperatura, baixa tensão de entrada e altitude. A família comercial “100 W” não substitui a potência nominal do modelo exato.

Uma saída física: positivo vermelho e negativo preto. Entrada: L marrom/N azul. Rabichos de 300 ± 10 mm. Não representar ramais externos como saídas independentes de fábrica.

Fonte: [ficha LPV-100, revisão 2026-09-07, páginas 1–2](https://www.meanwell.com/Upload/PDF/LPV-100/LPV-100-SPEC.PDF).

### Instalação e distribuição

O manual exige ventilação, compatibilidade da corrente dos cabos, avaliação da orientação e da temperatura, proteção das interconexões e execução por pessoa qualificada. IP da fonte não se transfere automaticamente às emendas nem ao conjunto. Manter a entrada AC separada da representação de cabos DC. Fonte classe II sem FG não dispensa avaliar as demais partes metálicas da instalação. Fonte: [manual MEAN WELL LED, revisão 2026-07-15, páginas 1 e 7](https://www.meanwell.com/Upload/PDF/LED_EN.pdf).

O esquema deve dividir as cargas entre fontes independentes. Não interligar saídas de fontes LPV para somar potência; não unir seus negativos como recurso automático. Cada fonte alimenta seus próprios ramais. Paralelismo dos módulos/ramais na saída de uma fonte é distinto do paralelismo entre fontes. Fonte: [FAQ MEAN WELL — “Can LED power supplies be connected in parallel?”](https://www.meanwell.com/qa.aspx?c=10).

## Cabos de cobre: resistência para a estimativa DC

| Produto Corfio | Seção por via | Rmáx a 20 °C por condutor | Valor em Ω/m |
| --- | ---: | ---: | ---: |
| Cabo Flexível BWF 750 V | 0,75 mm² | 26,0 Ω/km | 0,026 |
| Cabo Flexível BWF 750 V | 1,5 mm² | 13,3 Ω/km | 0,0133 |
| Cabo Flexível BWF 750 V | 2,5 mm² | 7,98 Ω/km | 0,00798 |

BWF é condutor isolado, sem cobertura conjunta, de cobre nu. PVC/A 70 °C em regime permanente. A página recomenda métodos de instalação protegidos, como eletrodutos e canaletas. Isso não comprova adequação para exposição direta ao tempo nem corrente admissível em qualquer montagem. Fonte: [Corfio — BWF 750 V](https://www.corfio.com.br/public/pt/produto/cabo-flexivel-bwf-750v).

O [catálogo oficial Corfio](https://www.corfio.com.br/documentos/Catalogo_de_Produtos-Corfio.pdf), página impressa 8 (página 8 do PDF), também lista Cabo Flexível PP 500 V **2 × 0,75**, **2 × 1,5** e **2 × 2,5 mm²**, classe 5, com as mesmas resistências máximas por condutor: 26,0; 13,3; 7,98 Ω/km. São opções com dois condutores sob cobertura; a seleção de produto e uso deve ser confirmada. A edição do catálogo não ficou identificada na leitura. Não usar a tabela AC de capacidade como aprovação automática para este estudo.

## Regras propostas para implementar no simulador

Estas são decisões de cálculo para o produto, distintas dos dados extraídos das fichas:

1. Compatibilidade de tensão deve ser exata: módulo 12 V não é automaticamente compatível com fonte 24 V. Não sugerir ligação de módulos 12 V em série para aproveitar fonte 24 V.
2. Potência da carga = soma das potências dos módulos posicionados. Corrente de projeto = potência / tensão, com identificação de valor nominal. Distribuir módulos inteiros por fonte e por ramal. O número mínimo por potência, isoladamente, não prova que a distribuição cabe nos limites por ramal.
3. Mostrar separadamente: potência nominal, capacidade usada no estudo, carga ligada, corrente, percentual de utilização e folga. Se o estudo adotar 80%, rotular “limite de utilização definido no projeto”; não afirmar que toda fonte MEAN WELL exige essa margem. Não confundir margem comercial com redução ambiental.
4. Registrar os limites do módulo por sequência/ramal e os critérios de instalação. Falta de temperatura, orientação, ventilação ou limite de corrente aplicável impede afirmar dimensionamento elétrico aprovado. Não preencher corrente admissível do cabo apenas a partir de sua bitola.
5. Para um trecho DC de comprimento de ida L, resistência por metro r e corrente I: ΔV = 2 × L × r × I. A ida e o retorno contam. Para rede ramificada, calcular cada trecho com a soma das correntes a jusante e somar a queda no caminho até cada módulo. Usar toda a corrente do ramal ao longo de todo o percurso é aproximação conservadora, devendo aparecer como tal.
6. R a 20 °C produz estimativa a 20 °C. Não apresentar resultado como queda real medida. Resistência de conexões, variação térmica e condutores integrados ao módulo precisam ser contabilizadas ou declaradas fora do modelo. Limite percentual editável é critério do estudo; não significa norma universal de 3%.
7. Quantidade de compra: L metros de percurso DC = 2L metros de condutor avulso, ou L metros de cabo de duas vias. Se houver reserva, explicitar percentual e aplicá-la ao material, sem confundi-la com extensão efetivamente instalada. Não descontar automaticamente rabichos existentes sem verificar o trajeto e a disponibilidade utilizável.
8. Separar alimentação externa até a letra de interligações entre módulos, conectores, derivações e material integrado ao módulo. Não cobrar novamente o fio integrado como fio avulso sem evidência. Não informar conectores “necessários” se a topologia de emendas ainda não foi definida.
9. O relatório por ramal deve conter: fonte de origem; módulos/peças atendidos; quantidade; W; A; percurso de ida; metros de condutor; produto/seção; resistência de referência; ΔV estimada; tensão estimada no ponto crítico; critério do estudo; pendências. O mapa deve identificar os dois polos e a fonte de cada grupo, sem depender somente de cor.
10. Seleção real no catálogo elimina o rótulo “componente fictício”; não elimina pendências do projeto, confirmação das fichas, aprovação elétrica ou validação da uniformidade luminosa.

## Exemplo aritmético fictício para teste

Uma carga nominal de 36 W em 12 V corresponde a 3 A. Trecho de ida de 5 m com resistência de referência de 0,0133 Ω/m: ΔV estimada = 2 × 5 × 0,0133 × 3 = **0,399 V**, ou **3,325%**. São 10 m de condutor avulso ou 5 m de cabo com duas vias, antes da reserva. Em LPV-60-12, essa carga corresponde a 60% da potência nominal; isso não aprova cabo, proteção, emendas ou condições ambientais. A conta ignora resistências adicionais e assume toda a carga no fim do trecho.

## Limitações da pesquisa

Não foram levantadas tabelas térmicas digitalizadas ponto a ponto nem validada uma função automática de redução de carga. O cadastro deve oferecer o link da curva e manter o fator ambiental como pendência ou valor confirmado pelo responsável. HLG e fontes de corrente constante foram deixadas fora deste primeiro catálogo para evitar equivalências incompletas. Não houve compra, medição em bancada, validação fotométrica, confirmação de disponibilidade no Brasil ou especificação de circuito AC.
