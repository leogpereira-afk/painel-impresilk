# Revisão independente da integração — 17/10/2026

Escopo: revisão dos cinco achados anteriores; project.mjs, nesting.mjs, documents.mjs e fabrication/storage.mjs. Sem edição de implementação ou página raiz. Reproduções pontuais executadas com o Node absoluto indicado. Não reexecutada a suíte integral.

## Rechecagem anterior

Confirmados corrigidos: O solicitado em 200 mm agora tem x=0 e largura=200; cm é rejeitado; os quatro casos malformados anteriores retornam errors; camada com cureHours negativo não recebe released; módulo órfão retorna potência null. Nenhuma regressão desses casos observada.

## Novos achados

1. **P1 — Exportação não confere assinatura dos parâmetros.** `src/lib/letras/documents.mjs:7`. `assertLetterRevision` só compara id e revision. Reprodução: calcular projeto com texto O; fazer cópia do projeto com texto WWWWW mantendo id/revision; chamar `letterSVG(copia,resultadoO)`: exportação aceita, sem erro, contendo a geometria antiga. O mesmo guard é utilizado por CSV/DXF/relatório. Importação/alteração externa pode fornecer mesmo número de revisão com outro conteúdo. Comparar assinatura calculada a partir do mesmo contrato de entrada do motor (`geometryInput` onde aplicável), além da revisão, e rejeitar resultados incompatíveis. Aviso nominal não resolve arquivo de outra geometria.

2. **P2 — Relatório de pintura ignora o contrato real e omite erros.** `src/lib/letras/documents.mjs:17-18`. O resumo lê `l.status`, `l.liters` e `l.consumptionLiters`; o motor fornece `selection`, `theoreticalLitres` e `withLossLitres`. Reprodução: camada apply com fabricante/SKU/ficha, rendimento 10, 1 demão e área 1 m² calcula 0,1 L, mas a tabela exportada mostra “Não informado / Pendente”. Além disso, a lista final só inclui painting.pending, não painting.errors, e o pre contém p.painting, não o resultado validado; tempo negativo pode desaparecer dos avisos do caderno. Consumir os campos reais e incluir explicitamente erros técnicos no documento de estudo.

3. **P2 — Aproveitamento declara área real enquanto calcula envelopes.** `src/lib/letras/nesting.mjs:9`. `nestLetters` usa retângulos como blank.contour e retorna campos herdados do ACM sem ajustar `utilizationBasis`, que afirma “Área real dos contornos desenvolvidos / área bruta...”. Reprodução com O de largura 200 mm: `usedArea=49379.310345`, `result.totals.areaMm2=15908.875668846686`; o índice deriva do primeiro. A etiqueta geral “envelopes conservadores” ajuda, mas o metadado específico é contraditório. Nomear a métrica como ocupação pelos envelopes ou calcular índice de área física separado, sem trocar as bases.

4. **P2 — Retalho recebe preço de chapa e entra como área comprada.** `src/lib/letras/nesting.mjs:12-14`. O motor compartilhado aceita stock.remnants e pode produzir source='remnant'. `costLetters` trata toda sheet como quantity 1/unit chapa e usa o mesmo preço por material, independentemente da origem ou formato. Reprodução: O de 200 mm, retalho compatível 300×300 e preço de chapa 100 => linha RET-demo, unit chapa, price 100, complete=true, purchasedM2=0.09. O retalho não é uma chapa nova comprada e seu preço precisa de regra própria ou valor pendente. Preservar source/sourceId, separar área consumida de área comprada e não declarar custo completo sem precificação aplicável ao retalho. Alternativa para esta etapa: rejeitar retalhos explicitamente na importação se não forem suportados na interface.

## Armazenamento e limites da revisão

Leitura de storage.mjs e indexeddb.mjs não revelou outro defeito concreto no fluxo examinado. Há isolamento por produto/owner, versão otimista no rascunho, integridade e imutabilidade das revisões/documentos. `serialize` exporta somente o projeto atual; não inclui histórico/documentos. Essa limitação deve permanecer explícita na UI/documentação caso o botão seja chamado backup, mas não foi tratada como bug sem revisar a UI raiz ainda em integração. Não houve exercício de IndexedDB real neste passe.

Não exigidos nesta etapa: fabricação liberada, CAM, desenvolvimento compensado, distribuição óptica, projeto estrutural ou cobertura integral do roadmap. Persistem como limites declarados.
