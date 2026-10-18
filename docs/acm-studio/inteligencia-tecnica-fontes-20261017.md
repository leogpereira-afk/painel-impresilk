# ACM Studio: inteligência técnica com fontes e limites

Data da análise: 17/10/2026. Escopo: síntese original dos dois PDFs fornecidos, sem redistribuição dos arquivos ou de suas ilustrações. A leitura orienta estudo, documentação e conferência; não certifica a fabricação nem dimensiona cargas, vento, ancoragem ou instalação.

## 1. Identificação das fontes

| Fonte | Identificação do conteúdo | Contagem / paginação | Natureza |
| --- | --- | --- | --- |
| Manual de instalação Alucomaxx | Capa: revisão 1, maio de 2023. Nome do arquivo fornecido indica rev.05.24, o que não comprova a revisão interna. | 36 páginas; posições no PDF coincidem com as páginas impressas consultadas. | Recomendação do fabricante para materiais e sistemas específicos. |
| Apostila Fachadas em ACM | Material didático fornecido; revisão não identificada na análise. | 69 páginas no PDF. A numeração impressa pode ser uma unidade menor; as referências deste relatório usam a posição no PDF, com a capa como página 1. | Formação, sequência de projeto e exemplos de consumo e beneficiamento. |

A análise do manual incluiu extração de texto integral das 36 páginas, renderização das páginas 9–34 e inspeção dos desenhos e tabelas relevantes das páginas 9–13, 15–20, 23–24, 26–27, 29–30 e 34. A apostila teve leitura de texto e desenhos complementares pelo agente coordenador; a implementação desta biblioteca considerou também os trechos de levantamento das páginas 14–19 e direção/juntas das páginas 39–41. Não se verificaram atualizações comerciais, garantia vigente ou normas fora dos PDFs fornecidos.

## 2. Separações fundamentais para o produto

### Estudo geométrico, orçamento e aprovação técnica

Um desenho coerente, uma amostra registrada e um quantitativo completo são evidências distintas. Nenhum deles, isoladamente, aprova a fixação de uma fachada. O manual pede participação de profissionais qualificados e definição do sistema adequado (p. 5), condiciona reforços às cargas e à solução de apoio (pp. 14–15) e exige projeto/teste para fita exclusiva em fachadas verticais (p. 28).

A interface deve manter explícita essa separação. Um check com dados completos significa apenas que há registro. A biblioteca nova usa os estados `missing`, `attention`, `review` e `recorded`; não produz `approved`, `productionReady` nem altera a validade do motor.

### Face aparente, desenvolvimento e verso

O desenvolvimento não equivale à face acabada: inclui abas, retornos, alívios e compensações da configuração (apostila pp. 37–38; Alucomaxx pp. 13 e 16). O verso de usinagem precisa conservar a referência, o ID e a revisão da peça, com espelhamento uma única vez. Não basta espelhar os furos se os canais e os recortes permanecem na referência frontal.

O plano da chapa e a posição na fachada são espaços diferentes. A biblioteca orienta conferir a mesma peça nas duas representações. O desenho frontal de fixação é identificado como montagem; as coordenadas de usinagem são apresentadas separadamente no verso do desenvolvimento.

### Núcleo residual e sobra total

A sobra total da seção após usinagem inclui núcleo remanescente e lâmina frontal. Com espessura total `t`, profundidade `d`, lâmina frontal `s` e núcleo residual `r`:

- `sobra total = t - d`;
- quando os dados forem consistentes, `sobra total = s + r`.

Essas identidades explicam as grandezas; não escolhem um resíduo adequado para o processo. No exemplo da apostila p. 52, o total remanescente de 0,40–0,50 mm contém a lâmina de 0,30 mm. Não é correto lançar a soma como núcleo residual. O manual p. 11 mostra outras cotas remanescentes em desenhos de canais diferentes; elas também não viram um valor geral de núcleo PE.

## 3. Usinagem, dobras e retornos

O manual descreve usinagem pelo verso e preservação da lâmina externa (pp. 10–11), exige uniformidade do canal e relaciona canais mais largos a outros raios e quantidades de núcleo remanescente (p. 12). As ferramentas, as condições e o teste de amostra precisam acompanhar o material.

Há divergências internas relevantes para qualquer automação:

- A p. 10 indica uma faixa textual de 95–105° e base de 4 mm para a solução discutida.
- A p. 11 ilustra canal de 94° com base de 3 mm, outro de 139° com base de 2 mm e uma solução larga de 14 mm, com remanescentes diferentes.
- O ângulo da fresa não equivale ao ângulo final da dobra.

A decisão adequada é uma biblioteca de seções com fonte e contexto, sem aplicar esses desenhos como presets de fabricação. O processo real requer amostra, ferramenta e material compatíveis. Para cada operação de uma cadeia, o produto precisa conservar comprimento, ângulo, sentido e compensação. Canais em uma peça técnica importada não especificam automaticamente uma montagem em 3D.

O exemplo de encapamento da apostila p. 60 relaciona dimensões ao perfil e à soma das espessuras de ACM/fita. A expressão `2 × (t + fita)` discutida nesse exemplo não é uma compensação universal de dobra e não deve ser somada automaticamente a toda bandeja.

Regras de produto sugeridas:

1. Manter número e referência de cada dobra no mesmo documento que mostra o desenvolvimento.
2. Invalidar a evidência de calibração quando o processo material/geometria relevante mudar, conforme o contrato do motor.
3. Exigir conferência da sequência e das interferências; não inventar um retorno ou raio com base em uma foto.
4. Exibir diferenças de camadas e registrar valores ausentes como desconhecidos.

## 4. Fita, parafusos e função das interfaces

### Fita

A área ou o comprimento geométrico de fita não define a resistência do conjunto. O manual condiciona aplicação à ficha, à preparação e ao projeto (pp. 14, 17, 19, 26, 28–29). Temperatura, pressão, primer, cura, substrato e tipo da fita dependem do produto utilizado.

Há referências diferentes:

| Assunto | Apostila | Alucomaxx | Interpretação para o sistema |
| --- | --- | --- | --- |
| Largura/espessura de fita | p. 33: indicação de pelo menos 19 mm e 1,5 mm. A tabela p. 62 traz outras larguras. | p. 28: indicação de pelo menos 25 mm e 1,1 mm, customizadas ao projeto. | Não criar mínimo universal e não trocar automaticamente o cadastro. Conferir SKU, substrato e sistema. |
| Sistema colado | Exemplo didático de aplicação e consumo. | pp. 17–19 restringem os sistemas descritos a interiores; p. 28 discute fita exclusiva vertical mediante projeto e teste. | Distinguir o detalhe construtivo e a exposição. Não converter uma descrição em autorização genérica para exterior. |
| Forro | O exemplo de consumo não dimensiona essa situação. | p. 28 desaconselha fita no sentido horizontal e pede análise específica. | Mostrar revisão específica quando houver fita efetiva no forro, inclusive por override. |
| Carga/consumo | p. 62 traz referência para estimativa. | p. 19 e pp. 28–29 trazem números indicativos sob condições distintas. | Não deduzir vento, quantidade mínima segura ou liberação de carga. |

Na biblioteca implementada, valores abaixo de 25 × 1,1 mm geram uma atenção específica apenas quando o fabricante do material foi identificado como Alucomaxx. Para fabricante diferente ou desconhecido, os números permanecem referências atribuídas, sem diagnóstico universal. Em todos os casos, a biblioteca preserva as medidas do estudo.

### Parafusos e furos

As cantoneiras do sistema aparafusado conectam a aba à subestrutura e podem desempenhar funções diferentes (Alucomaxx pp. 15–17). O mapa precisa identificar apoio, posição e função; o cadastro deve distinguir diâmetro nominal do parafuso e Ø de furação especificado.

O manual não fornece um diâmetro ou espaçamento universal que possa ser deduzido da espessura do ACM. Um ponto sem Ø explícito deve permanecer informativo. A UI e o checklist não inferem diâmetro do parafuso nominal. Fonte, responsável e data da conferência do padrão são evidências diferentes da distribuição geométrica.

### Metais diferentes

Alucomaxx pp. 29–31 trata compatibilidade, isolamento e corrosão galvânica; inox não implica compatibilidade direta com alumínio. A p. 31 recomenda subestrutura de alumínio e pede isolamento apropriado para outros materiais, considerando ainda a dilatação diferencial quando se utiliza metalon/aço. O plano de metalon do software continua sendo um plano geométrico de perfis e cortes.

O aviso contextual menciona aço somente quando há material de perfil explicitamente cadastrado. Material desconhecido não é preenchido como alumínio nem recebe indicação de compatibilidade.

## 5. Juntas, selantes e drenagem

As soluções de bandeja aparafusada, junta seca colada e fachada ventilada não são a mesma montagem (Alucomaxx pp. 13 e 15–20).

Para a bandeja aparafusada descrita, o manual relaciona junta de pelo menos 10 mm ao acesso da ferramenta, profundidade de montagem e dilatação (p. 16). Também traz abas recomendadas na faixa de 25–30 mm para aquela montagem. Isso não define o mínimo universal de toda aba ou de qualquer retorno.

Para selantes, as páginas 22–26 apresentam preparação, compatibilidade, cura e prevenção de aderência trilateral. O corpo de apoio/barreira separa o selante do fundo da junta. O núcleo PE/FR não é uma superfície equivalente ao alumínio para essa adesão (p. 26).

A divergência de sobredimensão do corpo de apoio precisa ser visível: Alucomaxx pp. 16 e 25 usa 30%; apostila p. 41 usa cerca de 25%. A escolha depende do produto e da seção real da junta.

As seções desenhadas diferem por sistema: Alucomaxx p. 23 indica A ≥10 mm e B ≥8 mm para a bandeja descrita; p. 24 indica A ≥10 mm e B igual à espessura do painel em outro detalhe. Não condensar esses desenhos em uma única seção padrão.

Para consumo de selante, a página 24 do manual adota rendimento volumétrico com fator 0,8 para sua perda de 20%. O exemplo de 310 ml e junta retangular 10 ×3 mm, usando essa convenção, resulta em aproximadamente 8,27 m. Dividir o volume por 1,2 representa outra convenção e resulta em valor diferente. A tabela/exemplo da apostila p. 61 não é reproduzida automaticamente por essa conta e não autoriza introduzir uma constante escondida para ajustar o orçamento. Sem produto, seção e convenção de perda, o consumo deve ficar desconhecido.

A fachada ventilada do manual requer sistema próprio, impermeabilização, drenagem e interfaces isoladas (p. 20). O simples afastamento de um quadro não permite declarar que a solução ventilada foi modelada. As páginas 21 e 34 reforçam o controle de água e arremates. A p. 34 traz inclinação textual e desenhos com faixas diferentes: não foi criado ângulo automático nem promessa de garantia a partir dessa informação.

## 6. Direção do material, levantamento e execução

Apostila p. 39 e Alucomaxx pp. 21 e 32 orientam coerência das setas de fabricação. A restrição deve estar no material efetivamente utilizado e ser respeitada no nesting e na montagem. O mesmo lote não elimina diferenças visuais quando a direção muda.

Apostila pp. 14–19 estrutura entrevista, medição, interferências, fotografias e comparação de opções no pré-projeto. O software pode organizar esses dados e alternativas, mas não comprova uma medição de campo nem deve transformar estimativa fotográfica sem escala em dimensão de fabricação.

Os tempos de aplicação/cura e as produtividades diárias descritos nas fontes são condicionados. Não foram incorporados como prazos garantidos, capacidade de equipe ou autorização para receber carga.

## 7. O que foi implementado nesta rodada

`src/lib/acm/knowledge.mjs` contém a síntese original, fontes com paginação, escopo de cada orientação e função de avaliação somente leitura. Nenhum PDF, imagem da fonte ou dado pessoal entra no repositório.

`TechnicalKnowledge.jsx` apresenta:

- Evidências do estudo e perguntas ainda abertas, com fonte/página e ligação à etapa correspondente.
- Relação visual entre núcleo residual, lâmina frontal e sobra total.
- Biblioteca por assunto: levantamento, usinagem/dobras, direção, fixações, estrutura, juntas/instalação e consumo.
- Explicação das divergências entre referências e do descompasso entre nome do arquivo e revisão indicada na capa do manual.
- Modo `focus="folds"` para o contexto de dobras.

A biblioteca não cria valores padrão, não muda medidas, não marca a produção como liberada e não substitui os avisos geométricos do motor. Os checks usam o sistema de fixação efetivo por peça, portanto um override para parafusos no forro não herda indevidamente a orientação de fita do padrão do projeto.

A rodada também tornou os planos de corte, metalon e fixação diretamente acessíveis: camadas legíveis, mapa amplo, contagem antes do cadastro e coordenadas no verso separadas da frente de montagem. Isso permite que o usuário confira a evidência geométrica mencionada pela biblioteca.

## 8. Verificações significativas

Os testes do módulo cobrem:

1. Distinção de núcleo residual e soma remanescente, com valores ausentes preservados e zero residual deliberado mantido.
2. Ausência de alteração do projeto durante a análise.
3. Aviso de dimensão de fita restrito ao fabricante identificado.
4. Avaliação do forro com os overrides efetivos de fixação.
5. Proibição de deduzir Ø de furação do diâmetro nominal do parafuso.
6. Registro de calibração sem limpar dúvidas de estrutura, instalação ou erros do motor.
7. Material individual sem lâmina informada mantendo a conferência pendente.
8. Referências de todas as orientações dentro da contagem real dos PDFs.

A inspeção visual integrada do shell e o resultado final dos testes do conjunto devem ser informados pelo coordenador após a integração. Teste de software não confirma ensaio físico ou adequação de uma solução construtiva.

## 9. Próximas melhorias possíveis, dependentes de escopo e dados

| Prioridade | Melhoria | Dados necessários | Condição para avançar |
| --- | --- | --- | --- |
| Alta | Dossiê de evidências por revisão: medição, amostra, fonte da fixação e detalhe de montagem. | Contrato de cadastro e armazenamento, autoria, revisão e vínculo entre evidência e configuração. | Não reutilizar evidência de uma configuração diferente nem inferir aprovação. |
| Alta | Seleção explícita do sistema e exposição. | Bandeja aparafusada/colada/ventilada, interno/externo, fabricante/SKU e detalhe executivo. | Avisos específicos; evitar que um único modo represente montagens incompatíveis. |
| Alta | Interface de isolamento para subestrutura e fixadores. | Materiais, isolamento, apoio e responsável pelo detalhe. | Manter cálculo geométrico separado de dimensionamento/corrosão. |
| Média | Biblioteca original de seções com uma legenda consistente. | Desenhos próprios e variantes com parâmetros completos e fonte. | Não copiar ilustrações dos PDFs nem inventar dimensões ausentes. |
| Média | Consumo de selante auditável. | Produto/volume, seção real, extensão e definição explícita de perda. | Fórmula rastreável e validação de unidade; divergência de tabela registrada. |
| Média | Confronto do lote/SKU real com direção e chapas de estoque. | Catálogo do fornecedor e cadastro de lote/chapa física. | Não misturar remanescentes incompatíveis nem permitir rotação não autorizada pelo material. |
| Posterior | Cálculo de fixação ou estrutura. | Modelo de engenharia, normas atuais, parâmetros de obra e validação responsável. | Trabalho distinto deste estudo geométrico; as fontes fornecidas não bastam para implementá-lo. |

Essas propostas são interpretações de produto a partir das fontes. Números específicos de processos só devem entrar em cálculos após definição do sistema e validação do caso.

## 10. Complemento de rastreabilidade, execução e revisão

Após a integração, a biblioteca foi ampliada com dados que ajudam a conferir a passagem do estudo para a obra, sem criar novos cálculos de engenharia:

- **Fabricante, SKU, lote e acabamento:** a conferência mostra cada combinação efetiva de material e mantém os campos ausentes explícitos. O lote se relaciona à identificação física e às setas (Alucomaxx pp. 21 e 32; apostila pp. 13 e 39), mas o registro não comprova inspeção do recebimento nem identidade cromática entre fornecedores.
- **Proteção da subestrutura:** o acabamento cadastrado é conferido nos perfis efetivos do resultado, incluindo configurações individualizadas. A apostila p. 42 descreve a oxidação do aço carbono externo e a necessidade de proteção; Alucomaxx pp. 29–31 exige atenção às interfaces entre metais. Pintura, galvanização e isolamento elétrico são questões diferentes. A biblioteca não escolhe tinta, processo, espessura de película ou produto isolante.
- **Transporte e manuseio:** os cuidados de Alucomaxx p. 14 e apostila pp. 16 e 46 orientam conferir proteção do acabamento, área limpa, recebimento e percurso das peças. Não se infere plano de içamento, capacidade de equipamento ou número de pessoas.
- **Peso e cargas:** um peso registrado no planejamento é mostrado como dado informado, com escopo e origem ainda sujeitos a conferência. Na ausência dele, permanece desconhecido. Não se converte área em massa do conjunto nem peso informado em capacidade da estrutura/fixação (Alucomaxx pp. 14–15, 28 e 31; apostila p. 45).
- **Acesso para manutenção:** o acesso descrito para instalar não comprova que um painel poderá ser retirado futuramente. A apostila p. 32 alerta sobre dificuldade de abertura em sistemas colados; Alucomaxx p. 22 pede manutenção/checagem dos selantes. Não se inventa um intervalo universal de inspeção.
- **Inspeção final:** a biblioteca apresenta uma síntese original de conferência de alinhamento, identificação, fixações, juntas, interfaces, acabamento e drenagem. Ausência de erro no modelo não comprova visita, inspeção física ou aceite de obra (Alucomaxx pp. 14, 21–22 e 33–34; apostila p. 46).

### Divergência adicional de limpeza e película

A página 59 da apostila foi extraída e renderizada para confirmar o conteúdo. Ela difere do manual Alucomaxx p. 33 na indicação de ângulo da película e no agente citado para resíduos; também apresenta uma janela de dias para retirada, enquanto o manual orienta retirada após a instalação (pp. 21 e 33). O desenho da apostila confirma a orientação de ângulo de seu próprio texto, portanto não é apenas um erro da extração de PDF.

Nenhum desses números ou produtos foi transformado em procedimento automático. A orientação na biblioteca é obter a instrução atual do fabricante/SKU e distinguir preparação para adesão, limpeza do acabamento e tratamento de resíduo. Um produto citado para uma tarefa não é automaticamente compatível com as demais. O módulo não recomenda solvente nem valida quimicamente o texto que o usuário eventualmente registrar no planejamento.

### Regressão corrigida na evidência das dobras

O motor conserva duas representações: `piece.edges` contém alturas numéricas legadas, enquanto `piece.edgeDefinitions` contém as cadeias completas. O checklist consultava a primeira e contava zero bordas múltiplas em uma peça que tinha duas operações reais.

Uma regressão com `buildProject` reproduziu a falha antes da correção. A evidência agora usa `edgeDefinitions`; para resultados legados sem esse campo, usa a composição de `project.edges` com o override de borda da peça. Peças técnicas planas não herdam as dobras paramétricas do projeto. O teste cobre uma cadeia dupla, uma segunda cadeia via override, o fallback legado e o caso técnico plano.

O conjunto de testes de conhecimento foi ampliado para 14 casos, incluindo dados ausentes, peso apenas informado, proteção versus isolamento e ausência de validação de limpeza/aceite. Para preservar a leitura compacta, o painel mostra seis cartões prioritários e mantém os demais pontos de conferência recolhidos, com acesso explícito.


## 11. Juntas, bandeja e fixação — complemento solicitado

Fontes adicionais fornecidas pelo dono:

- [Fachadas em ACM: Tipos de Juntas](https://www.youtube.com/watch?v=8v-h4S_6AsY): transcrição integral consultada. O conteúdo distingue montagem da peça e acabamento da junta. O exemplo de chapas encostadas é interno; a discussão externa considera variação térmica. Junta seca pode revelar um fundo de outra cor, enquanto junta selada exige detalhe e superfície de adesão compatíveis. Nenhuma largura universal foi extraída.
- [OS 4 MELHORES PARAFUSOS PARA FIXAR O ACM! E um rebite!](https://www.youtube.com/watch?v=9dY438SGdV8): página e demonstração visual consultadas; transcrição indisponível. Não se afirma análise integral do áudio, nem se extraem passo, diâmetro ou capacidade.
- [Qual a espessura correta da fita pra ACM?](https://www.youtube.com/watch?v=TJyrooSdIZk): página e trecho visual consultados; transcrição indisponível. Nenhuma espessura universal foi adotada.

Decisões explícitas do dono: “bandeira” significa bandeja dobrada; furos automáticos somente nas abas, sem perfurar a face aparente. Essas decisões são requisitos do sistema, não parâmetros atribuídos aos vídeos.

Implementação: etapa inicial com forma, junta, fixação e exposição separadas; avisos de incoerência; nenhuma remoção silenciosa de dobras. As posições dos parafusos pertencem ao desenvolvimento da aba e identificam borda/operação. Exportação pelo verso espelha uma vez. Fita mantém seus apoios e furos explícitos importados são preservados. Cantoneiras e ancoragem permanecem sem validação automática. Trocar o sistema de fixação invalida a conferência anterior; padrões legados da face não são considerados validados para as abas.
