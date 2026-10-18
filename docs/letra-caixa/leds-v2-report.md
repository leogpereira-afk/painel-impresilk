# LEDs v2 — distribuição e ligação derivadas

Data: 17/10/2026. Implementação local, sem commit, publicação ou dados reais.

## Entregue

- `light-layout.mjs`: `createLightLayout`, `validateLightLayout`, `calculateLightLayout`, `moduleFits`, `lightLayoutSVG`, `lightLayoutCSV`. O resultado tem identidade/revisão/assinaturas, módulos globais em mm, contagem por letra, circuitos, fontes, percursos, totais, erros e pendências. `config` é a configuração usada.
- Malha centralizada independente por letra; módulo inteiro mais recuo deve caber em uma ilha e respeitar os vazados. Também verifica concavidades e um vazado totalmente coberto pelo retângulo. Cruzes laranja indicam centros de malha que estão na arte, mas não comportam o módulo/recuo. Ilhas sem módulo e letras sem cabimento geram aviso.
- LED DEMO fictício 20 × 10 mm, 12 V, 0,72 W, até 30 módulos/ramal. Fonte DEMO fictícia 60 W, 80% utilizável, 4 saídas e limite configurado de 2,5 A por saída. Estes são valores de demonstração, não especificação de produto. LED e fonte têm marcadores de demonstração e fichas separados; tornar o LED real não esconde uma fonte demonstrativa.
- Ramais divididos pelo menor limite entre módulos por ramal, corrente da saída e potência utilizável. Fontes recebem ramais inteiros por capacidade e quantidade de saídas. Nenhuma saída de fonte é unida a outra. O esquema é de módulos em paralelo, dois condutores por ligação, embora a rota física percorra os módulos em sequência.
- Rotas explícitas: plano traseiro externo com descidas/subidas, ou retas internas com detecção de cruzamentos de bordas/vazados. Fontes têm origem XYZ configurável; fontes seguintes aparecem a cada 80 mm **somente no esquema**. Caixas de fonte no desenho são simbólicas. Furos, passagens, suporte, gabinete, proteção, rede e aterramento continuam pendentes de projeto.
- Cabo é comprimento geométrico de ida da rota + reserva configurada; condutores = duas vezes esse valor. Queda por trecho é `2 × comprimento de ida × resistência de um condutor × corrente a jusante`, acumulada até o último módulo. Resistência ausente deixa queda pendente. Superar o limite configurado é erro e bloqueia exportação. Não se inventam bitola, corrente admissível, resistência ou norma local.
- Painel `LedPlanner` recebe `{project,result,onChange,layout?,onExport?}`. Usa resultado corrente do worker quando disponível. `onChange` emite configuração lighting. Exportação delegada emite `led-svg`/`led-csv`; sem callback há download local. Tem seleção, ajuste X/Y, adição, exclusão e regeneração, mapa de circuitos, fontes, dia/noite ilustrativo e controles recolhíveis.
- `LetterViewport` aceita `lighting`, `showLighting` e `fill`: módulos e rotas no 3D/2D, interior aberto, exterior fechado e noite ilustrativa. Barra principal compacta com seletor de vista; opções avançadas recolhidas. `fill` ocupa o contêiner flexível.
- SVG e CSV derivam dos mesmos pontos. CSV inclui módulos, trechos, ramais, fontes e total. Exportações verificam projeto/revisão, assinatura da geometria e assinatura da configuração para rejeitar resultados desatualizados.
- Limites de densidade/complexidade, quantidades e validação de campos não finitos evitam distribuição arbitrária ou travamento sem controle.

## Fonte primária consultada

[Principal Sloan — LED Sign Lighting Installation Guide, Rev. B 2024-06-21](https://principalsloan.com/uploads/principal-sloan-led-sign-lighting-install-guide.pdf), consultado em 17/10/2026. As páginas 1–4 orientam usar a ficha de cada módulo/fonte para carga e ramais e testar uniformidade com a caixa/face antes de fixar módulos. O documento distingue alimentação, saídas e passagens. Seus requisitos NEC/UL e receitas de instalação norte-americanas **não foram transformados em regras brasileiras**. Nenhum modelo do fabricante foi cadastrado como se fosse o modelo demonstrativo.

## Verificação

- 19 testes de motor passaram: contagem e determinismo, módulo inteiro/recuo, vazados minúsculos e O/B, concavidade, regiões sem cabimento, tensão incompatível, ramais/saídas/capacidade, reconciliação de potência, ida/retorno/reserva, queda excedida, deslocamento da fonte, ajuste/exclusão/regeneração, sobreposição e órfãos, famílias sem LED, parâmetros inválidos/complexidade, SVG/CSV, assinaturas obsoletas, demonstração independente da fonte e rota interna cruzando vazio.
- ESLint dos três arquivos JS/JSX de produção passou.
- Build de revisão passou; aviso já existente de chunks maiores que 500 kB. Navegação integrada desktop/mobile e testes amplos são coordenados pelo agente principal.

## Limites explícitos

Distribuição não é otimização fotométrica, previsão de lux nem liberação de fabricação. Não há rotação do módulo ou roteamento automático que garanta viabilidade de furos/passagens. A malha destaca candidatos sem cabimento, mas não certifica cobertura de toda região da letra. Módulos no esquema são de um único modelo por projeto; circuitos e fontes são derivados de limites configurados e exigem fichas e conferência em condições reais.
