-- A ABA "ANOS": o padrao de consumo da casa, automatico.
--
-- O pedido, na integra: "voce ja lanca automatico todos os clientes que
-- compraram de janeiro de 2020 ate hoje, seguindo a mesma premissa, puxado do
-- sistema de maneira automatica, para eu ir identificando o padrao de consumo
-- -- e as vendas de campanha entram ACUMULADAS dentro do mes, para eu saber
-- que naquele mes as vendas foram de campanha. Vou saber quanto vende naquela
-- epoca do ano, quem compra e o tipo de produto."
--
-- A agregacao mora AQUI porque a base inteira sao 20.820 O.S. com itens --
-- baixar isso ao navegador para somar e o erro que a tabela painel_ordens
-- existe para evitar. O panorama desce em ~80 linhas; o detalhe de um mes so
-- desce quando o mes e aberto.
--
-- "Venda de campanha" NAO e deducao: e a O.S. que a direcao MARCOU numa
-- campanha (o mesmo ato de sempre). O acumulado do mes e a soma dessas.

-- 1. O PANORAMA: uma linha por mes E uma por ano, no mesmo passo.
--    A linha do ano existe porque "clientes diferentes no ano" NAO sai somando
--    os meses -- o cliente que compra em marco e outubro viraria dois. O
--    grouping sets conta o distinct nos dois graos de uma vez.
drop function if exists public.painel_anos_panorama();
create or replace function public.painel_anos_panorama()
returns table (ano text, mes text, valor numeric, os bigint, clientes bigint,
               valor_campanha numeric, os_campanha bigint)
language sql
stable
security definer
set search_path = public
as $$
  with camp as (
    select distinct jsonb_object_keys(registro->'os') as osid
      from public.painel_registros where colecao = 'campanhas'
  ),
  base as (
    select to_char(o.data, 'YYYY')    as ano,
           to_char(o.data, 'YYYY-MM') as mes,
           o.valor, o.cliente_chave,
           (c.osid is not null)       as eh_campanha
      from public.painel_ordens o
      left join camp c on c.osid = o.id
     -- O piso e a MESMA regua que a carga usa para varrer o ERP (a funcao
     -- que a permuta mais antiga empurra). Numero fixo aqui abriria duas
     -- reguas para a mesma base: o banner diria "todas as O.S." e o corte
     -- esconderia 2018/2019 em silencio se a varredura um dia recuar.
     where o.data is not null
       and o.data >= coalesce(public.permutas_historico_desde(), date '2020-01-01')
  )
  select ano,
         mes,                                     -- null na linha do ano
         round(sum(valor), 2)                     as valor,
         count(*)                                 as os,
         count(distinct cliente_chave)            as clientes,
         round(coalesce(sum(valor) filter (where eh_campanha), 0), 2) as valor_campanha,
         count(*) filter (where eh_campanha)      as os_campanha
    from base
   group by grouping sets ((ano, mes), (ano))
   order by ano, mes nulls first;
$$;

-- 2. O DETALHE DE UM MES: quem comprou e o que foi vendido.
--    Clientes com a fatia de campanha separada; produtos vem dos ITENS
--    (produto + modelo, o grao que diz o que estocar), top 25 por valor --
--    o resto vem somado numa linha "outros" para a conta sempre fechar.
create or replace function public.painel_anos_mes(p_mes text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with camp as (
    select distinct jsonb_object_keys(registro->'os') as osid
      from public.painel_registros where colecao = 'campanhas'
  ),
  do_mes as (
    select o.*, (c.osid is not null) as eh_campanha
      from public.painel_ordens o
      left join camp c on c.osid = o.id
     where o.data is not null and to_char(o.data, 'YYYY-MM') = p_mes
  ),
  cli as (
    select cliente_chave as chave,
           (array_agg(cliente order by data desc))[1] as nome,
           round(sum(valor), 2) as valor,
           count(*) as os,
           round(coalesce(sum(valor) filter (where eh_campanha), 0), 2) as valor_campanha
      from do_mes group by 1 order by sum(valor) desc
  ),
  prod as (
    select coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           i->>'produto' as produto,
           round(sum((i->>'valorTotal')::numeric), 2) as valor,
           round(sum((i->>'quantidade')::numeric), 2) as quantidade
      from do_mes, jsonb_array_elements(itens) i
     where coalesce(i->>'produto','') <> ''
     group by 1, 2 order by 2 desc
  ),
  -- O QUANTO OS ITENS COBREM DO MES. O ranking le itens; O.S. sem itens
  -- carregados e unioes do ERP sem sub-item nomeado nao entram nele. Sem
  -- estes numeros, um mes descoberto desceria "produtos: []" ao lado de um
  -- total alto -- igualzinho a "nao vendeu produto nenhum". A tela avisa.
  -- CUIDADO DE REGUA: os itens somam o BRUTO rateado; o total do mes e
  -- liquido de desconto. O ranking so pode ser conferido contra o bruto das
  -- O.S. que ele leu -- comparar com o total misturaria as duas reguas.
  prod_cob as (
    select count(*) filter (where jsonb_array_length(coalesce(itens, '[]'::jsonb)) > 0) as os_com_itens,
           count(*) filter (where jsonb_array_length(coalesce(itens, '[]'::jsonb)) = 0) as os_sem_itens,
           round(coalesce(sum(bruto) filter (where jsonb_array_length(coalesce(itens, '[]'::jsonb)) > 0), 0), 2) as bruto_com_itens
      from do_mes
  ),
  prod_rank as (select *, row_number() over (order by valor desc) rn from prod)
  select jsonb_build_object(
    'mes', p_mes,
    'total', (select round(coalesce(sum(valor), 0), 2) from do_mes),
    'os', (select count(*) from do_mes),
    'clientesQtd', (select count(distinct cliente_chave) from do_mes),
    'campanha', jsonb_build_object(
      'valor', (select round(coalesce(sum(valor) filter (where eh_campanha), 0), 2) from do_mes),
      'os', (select count(*) filter (where eh_campanha) from do_mes)),
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'nome', nome, 'valor', valor, 'os', os, 'valorCampanha', valor_campanha)), '[]'::jsonb)
      from (select * from cli limit 25) t),
    'clientesFora', greatest(0, (select count(*) from cli) - 25),
    'produtos', (select coalesce(jsonb_agg(jsonb_build_object(
        'rotulo', rotulo, 'produto', produto, 'valor', valor, 'quantidade', quantidade)), '[]'::jsonb)
      from (select rotulo, produto, valor, quantidade from prod_rank where rn <= 25) t),
    'produtosForaValor', (select round(coalesce(sum(valor), 0), 2) from prod_rank where rn > 25),
    'produtosCobertura', (select jsonb_build_object(
        'osComItens', os_com_itens, 'osSemItens', os_sem_itens, 'brutoComItens', bruto_com_itens,
        'valorLido', (select round(coalesce(sum(valor), 0), 2) from prod)) from prod_cob)
  );
$$;

revoke all on function public.painel_anos_panorama() from public, anon, authenticated;
revoke all on function public.painel_anos_mes(text) from public, anon, authenticated;
grant execute on function public.painel_anos_panorama() to service_role;
grant execute on function public.painel_anos_mes(text) to service_role;
