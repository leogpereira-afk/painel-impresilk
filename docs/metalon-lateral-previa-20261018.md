# Metalon e laterais — prévia local

Pedido: trazer a edição dos quadros para Metalon sem referências visíveis ao módulo de origem; organizar também as laterais de Acrílico e MDF. Não publicado.

- Metalon mantém o motor compartilhado de estrutura e corte de barras, com identidade própria na interface.
- Perfis padrão rápidos; distribuição uniforme de travessas ou montantes; seleção sincronizada com a prévia; alteração de seção/parede por elemento; posição dos apoios internos; remover e repor trechos.
- Alterações recalculam consumo, geometria, vão interno e invalidam planos/furos confirmados quando necessário. Remover trecho subdividido conserva assinatura geométrica.
- Busca sem acentos e recolher/expandir seções nos três materiais. Busca não modifica projeto.
- Chapa galvanizada continua frontal, plana e opcional; corte a 90° mantido. Não foi habilitada meia-esquadria nem dimensionamento estrutural.
- Dados de teste alterados apenas na origem de QA 4321. Rascunho do usuário em 4320 preservado.

Validação: 1.295 testes passaram; lint dos arquivos JSX alterados e diff check sem erros. Build review passou (avisos existentes de tamanho de chunks). Navegador: distribuição de dois apoios gerou 6 elementos; remoção gerou 5 e reposição voltou a 6; busca de dimensões; busca de tampa no MDF; recolher deixou zero seções abertas; controles presentes no Acrílico. Corrigida sobreposição inicial da busca sobre botões ao rolar.

## Complemento: cores e plano de corte

Cores independentes do metalon e da chapa, paletas e seletores personalizados, persistidas no projeto e aplicadas às peças do 3D. A cor visual não muda comprimentos. Plano de barras reorganizado com sequência proporcional em SVG, numeração, tabela de início/fim, serra, refilos e sobras; atalho superior renomeado Plano de corte. A chapa plana mantém plano próprio abaixo das barras.

Teste adicional de independência das cores aprovado: suíte Oficina totalizou 98 testes. Conferência no navegador: metalon azul #1e40af e chapa branca #ffffff; plano fictício com duas barras, seis cortes e zero pendências.

## Quantidade automática de travas

Controles independentes de travessas horizontais e montantes verticais: atalhos 0–3 e seleção até 20, com atualização imediata, sem botão de aplicar. Zero remove somente a direção escolhida. A redistribuição preserva as demais direções e os perfis individuais mantidos, limpa posições/remoções anteriores dos apoios redistribuídos e recalcula os cortes. Cruzamentos podem gerar mais peças que apoios cadastrados. Navegador confirmou 3 horizontais + 2 verticais e retirada das horizontais preservando 2 verticais. 101 testes Oficina aprovados, lint sem erros e build review aprovado. Termo transversal aguardando esclarecimento: diagonal ou travessa horizontal. Não publicado.

O dono confirmou as duas opções: travessas horizontais e diagonais. Diagonais implementadas por vão livre, subindo/descendo/alternadas, com contorno externo íntegro, seção das horizontais e dois cortes paralelos contra as faces verticais. O plano usa envelope de ponta longa, ângulos relativos ao eixo (90° = corte reto) e perda longitudinal projetada por ponta. CSV inclui ponta curta e ângulos. Não representa dimensionamento de resistência. Navegador: exemplo com 3 horizontais, 2 verticais e 12 diagonais; 27 elementos em 3 barras e zero peças pendentes. Corrigida acumulação de arredondamento no alocador local; motor ACM original preservado.
