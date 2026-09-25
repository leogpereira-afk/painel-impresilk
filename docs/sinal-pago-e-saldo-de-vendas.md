# Sinal pago e saldo de vendas

O sinal é um adiantamento registrado na própria ordem de serviço do Mubisys.
A API oferece `valor_sinal`; a integração preserva esse campo como `sinalPago`.
O valor comercial continua sendo o bruto menos o desconto. Sinal não é desconto.

## Conciliação

- Os títulos recebidos são conciliados por identificação, sem duplicar os que também aparecem abertos.
- O sinal estabelece um mínimo comprovado de pagamento do pedido.
- Usa-se o maior entre o sinal e os pagamentos identificados, nunca a soma cega das duas fontes: elas podem representar o mesmo dinheiro.
- As parcelas em aberto continuam pelo saldo informado pelo ERP. O sinal não é novamente subtraído dessas parcelas.
- Empréstimos verdadeiros continuam fora dos recebimentos comerciais. Uma descrição com essa palavra não invalida o sinal confirmado no pedido.
- Retrabalho, permutas e descontos mantêm seus tratamentos próprios.
- Sem vínculo individual suficiente, sinal e outros pagamentos não comprovam que os valores são adicionais. Nesses casos o valor considerado é um mínimo e a composição precisa ser conferida; não se inventa quitação.

## Atualização e conferência

A carga completa atualiza os sinais das ordens desde o início da cobertura. A carga incremental atualiza a janela recente; alterações em pedidos antigos dependem da próxima carga completa. Campo ausente permanece nulo até uma consulta nova.

Conferir no Mubisys: valor final, sinal pago, saldo a pagar e títulos vinculados. A tela mostra o sinal já considerado junto do recebido. Testes cobrem sinal isolado, repetido nos títulos, pagamento parcial, quitação, retrabalho e duplicação de ordens.
