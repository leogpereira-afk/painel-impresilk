# Plano de chapas: auditoria e retalhos

Implementação e publicação autorizadas em 20/10/2026. Conferência da versão publicada pendente.

## Comportamento

- Retalhos opcionais têm identificação, dimensões em cm, quantidade e material. São consumidos antes de chapas novas, somente quando compatíveis. Não há baixa em estoque remoto.
- Compra contabiliza chapas novas mais reserva; resumo e PDF mostram os retalhos separadamente. Margens, separação, orientação, peças e quantidade são validadas pelo motor existente.
- Sugestões de redução são limitadas a 100 mm (10 cm), em uma dimensão principal de cada vez. Mostram benefício calculado e exigem aplicação explícita; não alteram dobras ou material. Até três sugestões, com busca limitada, sem promessa de ótimo global.
- Peças atendidas integralmente por retalhos não recebem redução sem economia real. Sugestões são invalidadas quando os dados mudam.
- Divisão compara alternativas com menos emendas e menos chapas; mantém painéis planos como opção. Cálculo por linha cede execução à interface e utiliza cache limitado por geometria e material.
- Gerar o plano não confirma sua conferência. Alterações retiram a confirmação.
- Rascunhos detectam revisão divergente e preservam a edição em uma cópia; não há sincronização entre computadores nem bloqueio atômico entre processos.
- Número do plano usa data de São Paulo. Erros identificam a medida de origem, mesmo após expansão em painéis.
- PDF usa a logo existente, cortes agrupados por equivalência técnica e esquemas equivalentes por quantidade. RT identifica retalhos e CH chapas novas; fundos cinza-claro, peças na cor escolhida e dobras azuis.
- A legenda do corte e as faces de coluna são legíveis em celular. Separação visual das faces não altera dimensões de fabricação.

## Verificação

325 testes do módulo e motor ACM aprovados; ESLint dos arquivos alterados, build Vite e diff check concluídos. Avisos de tamanho de bundles preexistentes mantidos.

Preparação da publicação: 1.382 testes de cálculo/fabricação, 1.662 regressões gerais e sete testes de acesso aprovados. Quinze verificadores aprovados; dependência pública atual de equipe-auth conferida. Uma falha inicial de relógio acelerado em Marketing foi investigada e não se repetiu no arquivo completo (54/54) nem na suíte geral com concorrência reduzida. Lint geral sem erros, um aviso preexistente em Agenda; build oficial com base `/painel-impresilk/`.

Conferências no navegador, sempre com dados fictícios:

- Cinco peças de 100 × 100 cm: sugestão de reduzir 0,72 cm em uma medida; compra passa de duas chapas para uma somente após aplicar.
- Retalho com outra cor não é usado.
- Dois retalhos de 120 × 220 cm atendem quatro das cinco peças de 99,28 × 100 cm; sobra uma chapa nova. Três retalhos atendem todas, compra zero.
- PDF baixado pela interface: exemplo com dois retalhos e uma chapa em uma página, com número, solicitante, cliente, material, desenhos e conferência pendente.
- Conferência manual altera o status; gerar sozinho não a altera.
- Viewport de 390 px sem transbordamento horizontal do documento; diagramas têm rolagem própria e legenda.
- Testes incluem limite exato de 10 cm, rejeição acima dele, uso único dos retalhos, quantidades, incompatibilidades, 100 medidas, conservação geométrica, conflitos de rascunho e identificação no PDF.

Não houve escrita em O.S. real, validação física de usinagem ou consulta de preços.
