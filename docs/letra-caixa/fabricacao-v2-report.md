# Roteiro e pranchas de fabricação — entrega local

Data: 17/10/2026. Implementação no clone autorizado de Letra Caixa. Nenhum commit ou deploy nesta frente; dados de teste fictícios.

## Arquivos e contrato

- `src/lib/letras/fabrication.mjs`: `createFabricationConfig`, `validateFabricationConfig`, `calculateFabrication(project,result)`, `fabricationSVG(project,result,options)` e `fabricationHTML(project,result,options)`.
- `src/lib/letras/fabrication.test.mjs`: 23 testes específicos.
- `src/components/letras/FabricationPanel.jsx` e `fabrication-panel.css`: painel compacto, etapas selecionáveis, desenho 2D, desenvolvimento de bordas e edição de emendas.

O painel recebe `{project,result,onChange,onExport}`. `onChange` recebe a configuração inteira de `project.fabrication`. `onExport` recebe `('svg',{stepId})` ou `('html',{})`. O resultado de cálculo contém `steps`, `strips` com `segments`, `cutGroups`, `totals`, `pending`, `errors` e `released:false`.

## Comportamento entregue

Roteiro por dependências, vinculado às peças e ao processo: arte/medidas → cortes por material e espessura → conformação de laterais externas/internas → união e rebarba → preparo/primer/pintura/verniz/cura quando aplicáveis → LEDs e teste quando luminoso → fechamento/fixações → molde/embalagem → instalação. Famílias planas ficam sem solda ou conformação metálica; multicamadas têm montagem de camadas. PVC somente router. Polimérica tem corte manual e bloqueio de soldagem metálica. Retroiluminação exige teste de halo/afastamento. ACM é face plana e lateral separada, sem friso V ou dobra inventados.

Cada contorno de lateral conserva ID, origem e posição na arte. O desenvolvimento usa comprimento nominal + compensação informada por contorno (rateada por comprimento entre os trechos) + sobreposição por trecho, inclusive no fechamento. Divisão por quantidade mínima, limite máximo ou posições explícitas em mm. Posições explícitas prevalecem e o limite continua validado. Máximo de 100 segmentos por contorno e 3000 peças; limites inviáveis geram erro.

Compensação e sobreposição não informadas permanecem `null`, nunca zero presumido. Zero explicitamente informado continua não validado até confirmação e referência de procedimento. Aba manual acrescenta largura separadamente da profundidade e espessura; não gera raio, vinco, alívio ou cálculo de dobra. Uma aba sem largura mantém largura final pendente.

Pranchas têm peças separadas por corte e referência de escala de 100 mm. Cortes, anotações e referências ocupam grupos distintos; textos/marcas não entram no grupo de corte. As pranchas de arte/montagem/molde conservam posições relativas das letras. A fase de conformação inclui contorno de referência e faixas; marcas INT/EXT, Fn e distância nominal relacionam a origem ao trecho. SVG é estudo dimensional, sem kerf ou comandos de máquina; HTML é caderno ajustado à página, sem alegação de impressão 1:1.

Mudança de revisão, assinatura geométrica, geometria inválida ou configuração inválida bloqueia exportação. Os estados são planejamento ou pronto para conferência; nenhuma execução ou liberação automática é registrada.

## Verificação executada

Aplicada a skill `verification-before-completion`. Rodada final desta frente: `node --test src/lib/letras/fabrication.test.mjs`: **23 passaram, 0 falharam**. Lint de `fabrication.mjs`, `fabrication.test.mjs` e `FabricationPanel.jsx`: **0 erros/avisos**.

Cobertura: ordem/dependências por família, compatibilidade de processo/material, bordas 30/75/150 mm, compensação não presumida, divisão por limite e posição, soma das sobreposições, aba, vazados, separação de camadas SVG, escala/IDs, posição das letras, escape HTML, revisão obsoleta, pintura dispensada, configurações malformadas, emendas obsoletas e determinismo.

Uma falha inicial foi investigada com `systematic-debugging`: a fixture de letra cega herdava face acrílica, incompatível com a validação do motor atual. Corrigida a fixture para usar `setLetterFamily` e repetida a verificação.

## Limites e conferência de integração

Legibilidade final no navegador, downloads reais, integração do worker e regressões gerais pertencem à conferência integrada do agente principal. Este relatório não afirma essas verificações antes de executadas. Pranchas e quantidades não equivalem a CAM aprovado, procedimento de união validado ou teste físico. Regras de oficina acima foram derivadas da especificação fornecida, sem receita universal de máquina, solda, pintura ou cura.

## Ajuste após revisão final: cortes independentes

A ordem de exibição foi preservada, mas deixou de determinar dependências. Fibra, CO₂, router e corte manual dependem somente da arte. Conformação depende dos processos que cortam as laterais; união reúne conformação e componentes cortados. Pintura depende da preparação aplicável; iluminação e fechamento reúnem cortes e acabamentos necessários. Famílias planas usam acabamento de bordas/camadas; passos ausentes não entram no grafo. O caderno desta frente exibe nomes de etapas nas dependências, em vez de IDs internos.

A verificação reproduziu as três falhas antes da correção (cadeia serial, reunião incompleta e IDs no caderno). Após a alteração: 23 testes passaram e lint permaneceu sem erros/avisos. Cobertura adicional verifica as oito famílias com e sem pintura, cortes paralelos, ausência de dependências futuras/cíclicas e reunião dos pré-requisitos de fechamento. `documents.mjs` e a página não foram alterados nesta correção.
