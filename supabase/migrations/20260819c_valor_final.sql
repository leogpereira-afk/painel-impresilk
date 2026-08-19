-- O VALOR DA O.S. E O VALOR FINAL: bruto menos desconto.
--
-- A O.S. 19386 (Empominas, 03/06/2025) mostra a regra inteira:
--     itens ......... 1.443,00 + 695,64 = 2.138,64   <- `valor_total` do ERP
--     descontos .....                      138,64    <- `valor_desconto`
--     valor final ...                    2.000,00    <- o que o cliente deve
-- O painel guardava 2.138,64. Numa permuta isso e credito consumido a mais.
--
-- POR QUE ISSO PASSOU: eu conferi 200 O.S. comparando `valor_total` com a soma
-- dos itens, vi que batiam mesmo nas 26 com desconto, e conclui que "o desconto
-- ja vem aplicado no item". Batiam porque `valor_total` E o bruto -- a soma dos
-- itens. O controle que escolhi nao conseguia detectar o erro que eu procurava.
-- O ERP nao tem campo de valor final: a tela dele calcula, e nos tambem.
--
-- BRUTO E DESCONTO FICAM GRAVADOS AO LADO, e nao so o resultado. Guardar so o
-- final faria a conta virar um numero de origem desconhecida -- exatamente o
-- que fez este erro durar. Com os tres, a tela mostra "2.138,64 - 138,64" e
-- qualquer pessoa confere contra o PDF do ERP sem precisar de mim.

alter table public.painel_ordens
  add column if not exists bruto    numeric(14,2) not null default 0,
  add column if not exists desconto numeric(14,2) not null default 0;

comment on column public.painel_ordens.valor is
  'Valor FINAL da O.S. (bruto - desconto): o que o cliente deve. E o que a permuta abate do credito.';
comment on column public.painel_ordens.bruto is
  'valor_total do ERP -- a soma dos itens, ANTES do desconto. Guardado para a conta ser conferivel.';
comment on column public.painel_ordens.desconto is
  'valor_desconto do ERP, no cabecalho da O.S.';
