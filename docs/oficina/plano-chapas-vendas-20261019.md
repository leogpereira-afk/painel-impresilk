# Plano de chapas para vendas — prévia local

Implementação autorizada pelo dono conforme prompt aprovado. O acesso Orçamento Impresilk foi substituído por Plano de chapas · Vendas; URL antiga encaminha à ferramenta. A biblioteca anterior de orçamento permanece preservada.

## Fluxo

- Formatos 1,22 × 5 m (padrão), 1,25 × 5 m e 1,50 × 5 m. Campos de medida visíveis apenas em Outro tamanho.
- Material padrão com marca/fabricante, referência/linha (SKU), revestimento Poliéster, acabamento separado, espessura e paleta COLORS do ACM.
- Campo de nome personalizado da cor, também na compra e PDF; amostra ilustrativa usa a cor-base da paleta. Trocar a cor-base limpa o nome anterior. Marcas e referências são informadas pelo operador, sem catálogo comercial inventado. Sugestões de marca usam os valores deste plano.
- Linhas compactas com medidas finais, quantidade e dobras. Material herdado; Alterar material abre exceção individual. Abas iguais ou independentes e desenvolvimento imediato.
- Resumo lateral em computador e sequencial em celular. Reserva adicional explícita por material. Plano 2D usa cores com contraste e números das peças.
- Salvar PDF baixa arquivo PDF real, com logo, identificação completa do material, lista de compra, peças/dobras e distribuição colorida paginada. Sem depender de popup de impressão.

## Integridade e limites

Reutiliza developBlank, nestPieces e validateNesting do ACM Studio, sem alterar seus arquivos. Cálculo geométrico por envelopes. Lotes independentes incluem fabricante, referência, cor-base, nome personalizado, revestimento, acabamento, espessura e sentido. Cada lote passa pela validação independente do motor; áreas e quantidade são agregadas. Peças que não cabem bloqueiam liberação de compra e PDF, sem emendas automáticas.

A simulação e os materiais informados são transitórios, com aviso na tela. Não há banco, cadastro corporativo persistente ou confirmação de estoque. Poliéster é revestimento, não o núcleo PE. Documento é estimativa de compras, não arquivo aprovado para fabricação.

## Verificação de 19/10/2026

1.334 testes de cálculo/fabricação passaram, incluindo 14 cenários do módulo. Lint dos arquivos alterados e builds de produção/prévia aprovados. Avisos anteriores de tamanho de módulos e React Router permanecem. Novo conjunto incluído no comando test do projeto.

Navegador: formatos, medidas personalizadas condicionais, material padrão/exceção, marca/referência, dobras e nome personalizado conferidos. Sem transbordamento em 390 px. PDF final baixado pelo botão, aberto com parser independente e renderizado: duas páginas no exemplo fictício, logo nas duas, identidade correta e seis peças em duas chapas. Verificado texto longo sem sair da área útil do PDF. Nenhum erro de console no fluxo.

Prévia: http://127.0.0.1:4321/dist-review/revisao-local.html#/ferramenta-ia?ferramenta=chapas-vendas

Sem commit, push ou publicação desta etapa. Alterações anteriores da Oficina preservadas.

## Integração para publicação

Entrega isolada sobre main 33cdfc6: 1.318 testes de cálculo/fabricação, 1.611 testes de integração (dois exigiram execução com porta localhost liberada), 7 testes de acesso, lint, build e conferidores aprovados. Conferência de sistemas usa equipe-auth da main pública atual; checkout local antigo estava desatualizado. Publicação autorizada pelo dono.

Publicado e conferido: commit fa8bfbc, GitHub Pages 39256388463 concluído com sucesso. Comparação binária de index.html e assets: 185/185 iguais. Tela autenticada conferida em produção: formato 1,22 × 5 m, poliéster, marca/referência, nome personalizado da cor e PDF presentes; sem erros de console.
