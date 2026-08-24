-- AS TRES ABAS QUE FECHAM O QUADRO: VENDEDORES, CLIENTES E PRODUTOS.
--
-- Pedido do dono (24/08): "uma quarta posicao seguindo o mesmo padrao, dos
-- vendedores -- aperta o ano e aparece os vendedores ativos naquele ano, ate
-- para nao acumular; dentro, as vendas em valores totais, os tipos de produto,
-- a curva dos clientes no mes, no ano e ano acumulado, e vincular um CNPJ no
-- outro quando um grupo compra com varios CNPJs. Uma de clientes, curva A e B,
-- o que compraram, para entender o comportamento. E a ultima de produtos, com
-- acumulado por mes, ano e periodos."
--
-- Mesma linha da aba Anos: a soma mora AQUI (20.839 O.S. nunca descem ao
-- navegador), o corte fala, e zero so e resultado quando foi medido.
--
-- OS GRUPOS DE COMPRA moram em painel_registros colecao 'grupos_clientes'
-- ({ nome, membros: [cliente_chave...] }), gravados pela tela. Toda funcao
-- daqui aplica o grupo ANTES de somar: o ranking, a classe ABC e o detalhe
-- enxergam o grupo como UM cliente. Membro em dois grupos vale o primeiro
-- (ordem de id): a tela RECUSA gravar o segundo (validado em gravarGrupo), e
-- este desempate existe para dado que entre por fora nao derrubar a conta.

-- ---------------------------------------------------------------- vendedores
-- Uma linha por (ano, vendedor): quem esteve ativo em cada ano, sem acumular.
create or replace function public.painel_vendedores_panorama()
returns table (ano text, vendedor text, valor numeric, os bigint, clientes bigint)
language sql stable security definer set search_path = public
as $$
  -- O distinct de clientes APLICA os grupos, como todo o resto: sem isso o
  -- painel dizia "353 clientes" aqui e outro numero no detalhe do mesmo
  -- vendedor -- duas reguas para a mesma pergunta.
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  )
  select to_char(o.data, 'YYYY') as ano,
         o.vendedor,
         round(sum(o.valor), 2) as valor,
         count(*) as os,
         count(distinct coalesce(gr.grupo_id, o.cliente_chave)) as clientes
    from public.painel_ordens o
    left join grupos gr on gr.membro = o.cliente_chave
   where o.data is not null and o.data <= current_date
     and coalesce(o.vendedor, '') <> ''
   group by 1, 2
   order by 1, 3 desc;
$$;

-- O detalhe de UM vendedor: a curva inteira (mes a mes, todos os anos), o
-- rollup por ano (distinct de clientes nao sai somando meses), e -- do recorte
-- pedido (um ano, ou tudo) -- os produtos e os clientes dele, com grupo.
create or replace function public.painel_vendedor_detalhe(p_vendedor text, p_ano text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id,
           coalesce(g.registro->>'nome', 'grupo') as grupo_nome
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       -- Registro malformado (membros que nao e array) nao pode derrubar as
       -- quatro funcoes de analise de uma vez.
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  minhas as (
    select o.*, coalesce(gr.grupo_id, o.cliente_chave) as chave_efetiva,
           gr.grupo_nome
      from public.painel_ordens o
      left join grupos gr on gr.membro = o.cliente_chave
     where o.data is not null and o.data <= current_date
       and o.vendedor = p_vendedor
  ),
  recorte as (
    select * from minhas where p_ano is null or to_char(data, 'YYYY') = p_ano
  ),
  cli as (
    select chave_efetiva as chave,
           coalesce(max(grupo_nome), (array_agg(cliente order by data desc))[1]) as rotulo,
           bool_or(grupo_nome is not null) as eh_grupo,
           round(sum(valor), 2) as valor, count(*) as os, max(data) as ultima
      from recorte group by 1 order by 3 desc, valor desc
  ),
  cli_rank as (select *, row_number() over (order by valor desc) rn from cli),
  itens_r as (
    select -- A chave vem PRONTA do item (trigger 20260824h); o calculo aqui e so
           -- rede de seguranca para item que escapou do backfill.
           coalesce(i->>'k',
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(i->>'produto',''), '\s+', ' ', 'g')))) || '|' ||
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(nullif(trim(i->>'modelo'),''), i->>'produto'), '\s+', ' ', 'g'))))) as chave,
           coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           r.data, (i->>'valorTotal')::numeric as valor, (i->>'quantidade')::numeric as qtd
      from recorte r, jsonb_array_elements(r.itens) i
     where coalesce(i->>'produto','') <> ''
  ),
  prod as (
    select chave, (array_agg(rotulo order by data desc))[1] as rotulo,
           round(sum(valor), 2) as valor, round(sum(qtd), 2) as quantidade
      from itens_r group by 1
  ),
  prod_rank as (select *, row_number() over (order by valor desc) rn from prod)
  select jsonb_build_object(
    'vendedor', p_vendedor,
    'ano', p_ano,
    'porMes', (select coalesce(jsonb_agg(jsonb_build_object(
        'mes', mes, 'valor', valor, 'os', os, 'clientes', clientes) order by mes), '[]'::jsonb)
      from (select to_char(data,'YYYY-MM') mes, round(sum(valor),2) valor, count(*) os,
                   count(distinct chave_efetiva) clientes
              from minhas group by 1) m),
    'porAno', (select coalesce(jsonb_agg(jsonb_build_object(
        'ano', ano, 'valor', valor, 'os', os, 'clientes', clientes) order by ano), '[]'::jsonb)
      from (select to_char(data,'YYYY') ano, round(sum(valor),2) valor, count(*) os,
                   count(distinct chave_efetiva) clientes
              from minhas group by 1) a),
    'total', (select round(coalesce(sum(valor),0),2) from recorte),
    'os', (select count(*) from recorte),
    'clientesQtd', (select count(distinct chave_efetiva) from recorte),
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'ehGrupo', eh_grupo, 'valor', valor,
        'os', os, 'ultima', ultima) order by valor desc), '[]'::jsonb)
      from cli_rank where rn <= 20),
    'clientesFora', greatest(0, (select count(*) from cli) - 20),
    'clientesForaValor', (select round(coalesce(sum(valor),0),2) from cli_rank where rn > 20),
    'produtos', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'valor', valor, 'quantidade', quantidade) order by valor desc), '[]'::jsonb)
      from prod_rank where rn <= 20),
    'produtosFora', greatest(0, (select count(*) from prod) - 20),
    'produtosForaValor', (select round(coalesce(sum(valor),0),2) from prod_rank where rn > 20),
    -- A regua dos produtos e o BRUTO das O.S. com itens (itens somam o bruto
    -- rateado; o total e liquido). A tela repete a nota das outras abas.
    'produtosCobertura', jsonb_build_object(
      'valorLido', (select round(coalesce(sum(valor),0),2) from itens_r),
      'brutoComItens', (select round(coalesce(sum(bruto) filter (where jsonb_array_length(coalesce(itens,'[]'::jsonb)) > 0),0),2) from recorte),
      'osSemItens', (select count(*) from recorte where jsonb_array_length(coalesce(itens,'[]'::jsonb)) = 0))
  );
$$;

-- ---------------------------------------------------------------- clientes
-- A curva ABC do recorte (um ano, ou tudo), com grupo aplicado ANTES do
-- ranking: o grupo que compra por tres CNPJs sobe para a classe certa.
-- Regua, dita na tela: A+ ate 30% do valor acumulado, A ate 80%, B ate 95%.
--
-- O A+ nasceu de um pedido do dono (24/08) olhando a discrepancia DENTRO da
-- classe A: o topo tinha R$ 2 milhoes e o pe R$ 35 mil na mesma caixa. O
-- corte por SHARE (30%) em vez de valor fixo foi medido no dado real: em
-- "todos" da 18 clientes (0,3% da carteira fazendo 30% do dinheiro, corte
-- equivalente ~R$ 165 mil); em 2026 da 7 clientes (corte ~R$ 88 mil). Valor
-- fixo envelheceria e erraria por recorte; o share e a regua da propria
-- curva, e cada classe desce com o menor valor dela para a tela dizer o
-- corte em reais.
create or replace function public.painel_clientes_abc(p_ano text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id,
           coalesce(g.registro->>'nome', 'grupo') as grupo_nome
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       -- Registro malformado (membros que nao e array) nao pode derrubar as
       -- quatro funcoes de analise de uma vez.
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  base as (
    select o.*, coalesce(gr.grupo_id, o.cliente_chave) as chave_efetiva, gr.grupo_nome
      from public.painel_ordens o
      left join grupos gr on gr.membro = o.cliente_chave
     where o.data is not null and o.data <= current_date
       and (p_ano is null or to_char(o.data, 'YYYY') = p_ano)
  ),
  cli as (
    select chave_efetiva as chave,
           coalesce(max(grupo_nome), (array_agg(cliente order by data desc))[1]) as rotulo,
           bool_or(grupo_nome is not null) as eh_grupo,
           round(sum(valor), 2) as valor, count(*) as os,
           min(data) as primeira, max(data) as ultima
      from base group by 1
  ),
  classada as (
    select *,
           case when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.30 then 'A+'
                when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.80 then 'A'
                when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.95 then 'B'
                else 'C' end as classe,
           valor / nullif(sum(valor) over (), 0) as share,
           row_number() over (order by valor desc, chave) as rn
      from cli
  )
  select jsonb_build_object(
    'ano', p_ano,
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'classe', classe, 'clientes', n, 'valor', v, 'corte', corte, 'shareClasse', sh)
        order by ordem), '[]'::jsonb)
      from (select classe, count(*) n, round(sum(valor),2) v,
                   round(min(valor),2) as corte,
                   round(sum(valor) / nullif((select sum(valor) from cli),0) * 1000) / 1000 as sh,
                   case classe when 'A+' then 0 when 'A' then 1 when 'B' then 2 else 3 end as ordem
              from classada group by classe) c),
    'total', (select round(coalesce(sum(valor),0),2) from cli),
    'clientesQtd', (select count(*) from cli),
    -- Os 200 maiores cobrem a classe A de um ANO (98 em 2026); no recorte
    -- "todos" a classe A tem 661 e o corte pega -- por isso o que fica de
    -- fora e DITO, classe a classe, e a tela repete.
    'lista', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'ehGrupo', eh_grupo, 'classe', classe,
        'valor', valor, 'os', os, 'share', round(share * 1000) / 1000,
        'primeira', primeira, 'ultima', ultima) order by rn), '[]'::jsonb)
      from classada where rn <= 200),
    'fora', (select coalesce(jsonb_agg(jsonb_build_object(
        'classe', classe, 'clientes', n, 'valor', v) order by ordem), '[]'::jsonb)
      from (select classe, count(*) n, round(sum(valor),2) v,
                   case classe when 'A+' then 0 when 'A' then 1 when 'B' then 2 else 3 end as ordem
              from classada where rn > 200 group by classe) f)
  );
$$;

-- O detalhe de UM cliente (ou grupo): a curva inteira, o que compra, e quem
-- vende para ele. p_chave aceita cliente_chave OU id de grupo.
create or replace function public.painel_cliente_detalhe(p_chave text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id,
           coalesce(g.registro->>'nome', 'grupo') as grupo_nome
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       -- Registro malformado (membros que nao e array) nao pode derrubar as
       -- quatro funcoes de analise de uma vez.
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  -- Perguntar por um MEMBRO do grupo responde pelo GRUPO INTEIRO: sem isto,
  -- a chave de um CNPJ que pertence a grupo devolvia o rotulo e o selo do
  -- grupo somando um CNPJ so -- selo de grupo com conta de individuo.
  alvo as (
    select coalesce((select gr.grupo_id from grupos gr where gr.membro = p_chave), p_chave) as chave
  ),
  dele as (
    select o.*, coalesce(gr.grupo_nome, null) as grupo_nome
      from public.painel_ordens o
      left join grupos gr on gr.membro = o.cliente_chave
     where o.data is not null and o.data <= current_date
       and coalesce(gr.grupo_id, o.cliente_chave) = (select chave from alvo)
  ),
  itens_r as (
    select -- A chave vem PRONTA do item (trigger 20260824h); o calculo aqui e so
           -- rede de seguranca para item que escapou do backfill.
           coalesce(i->>'k',
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(i->>'produto',''), '\s+', ' ', 'g')))) || '|' ||
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(nullif(trim(i->>'modelo'),''), i->>'produto'), '\s+', ' ', 'g'))))) as chave,
           coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           r.data, (i->>'valorTotal')::numeric as valor, (i->>'quantidade')::numeric as qtd
      from dele r, jsonb_array_elements(r.itens) i
     where coalesce(i->>'produto','') <> ''
  ),
  prod as (
    select chave, (array_agg(rotulo order by data desc))[1] as rotulo,
           round(sum(valor),2) as valor, round(sum(qtd),2) as quantidade
      from itens_r group by 1
  ),
  prod_rank as (select *, row_number() over (order by valor desc) rn from prod)
  select jsonb_build_object(
    'chave', p_chave,
    'rotulo', (select coalesce(max(grupo_nome), (array_agg(cliente order by data desc))[1]) from dele),
    'ehGrupo', (select bool_or(grupo_nome is not null) from dele),
    'membros', (select coalesce(jsonb_agg(distinct cliente), '[]'::jsonb) from dele),
    'total', (select round(coalesce(sum(valor),0),2) from dele),
    'os', (select count(*) from dele),
    'primeira', (select min(data) from dele),
    'ultima', (select max(data) from dele),
    'porMes', (select coalesce(jsonb_agg(jsonb_build_object(
        'mes', mes, 'valor', valor, 'os', os) order by mes), '[]'::jsonb)
      from (select to_char(data,'YYYY-MM') mes, round(sum(valor),2) valor, count(*) os
              from dele group by 1) m),
    'porAno', (select coalesce(jsonb_agg(jsonb_build_object(
        'ano', ano, 'valor', valor, 'os', os) order by ano), '[]'::jsonb)
      from (select to_char(data,'YYYY') ano, round(sum(valor),2) valor, count(*) os
              from dele group by 1) a),
    'vendedores', (select coalesce(jsonb_agg(jsonb_build_object(
        'vendedor', vendedor, 'valor', valor, 'os', os) order by valor desc), '[]'::jsonb)
      from (select vendedor, round(sum(valor),2) valor, count(*) os
              from dele where coalesce(vendedor,'') <> '' group by 1) v),
    'produtos', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'valor', valor, 'quantidade', quantidade) order by valor desc), '[]'::jsonb)
      from prod_rank where rn <= 20),
    'produtosFora', greatest(0, (select count(*) from prod) - 20),
    'produtosForaValor', (select round(coalesce(sum(valor),0),2) from prod_rank where rn > 20)
  );
$$;

-- ---------------------------------------------------------------- produtos
-- O que mais vendemos, no recorte (um ano, ou tudo). Grao produto+modelo
-- normalizado, rotulo pela grafia mais recente, e QUANTOS CLIENTES compram
-- cada um -- produto grande de um cliente so e outra conversa.
create or replace function public.painel_produtos_panorama(p_ano text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  recorte as (
    select * from public.painel_ordens o
     where o.data is not null and o.data <= current_date
       and (p_ano is null or to_char(o.data, 'YYYY') = p_ano)
  ),
  itens_r as (
    select -- A chave vem PRONTA do item (trigger 20260824h); o calculo aqui e so
           -- rede de seguranca para item que escapou do backfill.
           coalesce(i->>'k',
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(i->>'produto',''), '\s+', ' ', 'g')))) || '|' ||
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(nullif(trim(i->>'modelo'),''), i->>'produto'), '\s+', ' ', 'g'))))) as chave,
           coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           i->>'categoria' as categoria,
           -- "48 clientes compram isto" APLICA os grupos, como todo o resto.
           r.data, coalesce(gr.grupo_id, r.cliente_chave) as cliente_chave,
           (i->>'valorTotal')::numeric as valor, (i->>'quantidade')::numeric as qtd
      from recorte r
      left join grupos gr on gr.membro = r.cliente_chave,
           jsonb_array_elements(r.itens) i
     where coalesce(i->>'produto','') <> ''
  ),
  prod as (
    select chave, (array_agg(rotulo order by data desc))[1] as rotulo,
           (array_agg(categoria order by data desc))[1] as categoria,
           round(sum(valor),2) as valor, round(sum(qtd),2) as quantidade,
           count(distinct cliente_chave) as clientes
      from itens_r group by 1
  ),
  prod_rank as (select *, row_number() over (order by valor desc) rn from prod)
  select jsonb_build_object(
    'ano', p_ano,
    'produtos', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'categoria', categoria, 'valor', valor,
        'quantidade', quantidade, 'clientes', clientes) order by valor desc), '[]'::jsonb)
      from prod_rank where rn <= 30),
    'produtosQtd', (select count(*) from prod),
    'foraValor', (select round(coalesce(sum(valor),0),2) from prod_rank where rn > 30),
    'cobertura', jsonb_build_object(
      'valorLido', (select round(coalesce(sum(valor),0),2) from itens_r),
      'brutoComItens', (select round(coalesce(sum(bruto) filter (where jsonb_array_length(coalesce(itens,'[]'::jsonb)) > 0),0),2) from recorte),
      'osSemItens', (select count(*) from recorte where jsonb_array_length(coalesce(itens,'[]'::jsonb)) = 0))
  );
$$;

-- O detalhe de UM produto: a curva por mes e por ano (os periodos em que ele
-- vende) e quem o compra, com grupo aplicado.
create or replace function public.painel_produto_detalhe(p_chave text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id,
           coalesce(g.registro->>'nome', 'grupo') as grupo_nome
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       -- Registro malformado (membros que nao e array) nao pode derrubar as
       -- quatro funcoes de analise de uma vez.
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  itens_r as (
    select r.data, r.cliente, r.cliente_chave,
           coalesce(gr.grupo_id, r.cliente_chave) as chave_efetiva, gr.grupo_nome,
           coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           (i->>'valorTotal')::numeric as valor, (i->>'quantidade')::numeric as qtd
      from public.painel_ordens r
      join lateral jsonb_array_elements(coalesce(r.itens,'[]'::jsonb)) i on true
      left join grupos gr on gr.membro = r.cliente_chave
     where r.data is not null and r.data <= current_date
       and coalesce(i->>'produto','') <> ''
       and -- A chave vem PRONTA do item (trigger 20260824h); o calculo aqui e so
           -- rede de seguranca para item que escapou do backfill.
           coalesce(i->>'k',
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(i->>'produto',''), '\s+', ' ', 'g')))) || '|' ||
             upper(public.unaccent_simples(trim(regexp_replace(coalesce(nullif(trim(i->>'modelo'),''), i->>'produto'), '\s+', ' ', 'g'))))) = p_chave
  ),
  cli as (
    select chave_efetiva as chave,
           coalesce(max(grupo_nome), (array_agg(cliente order by data desc))[1]) as rotulo,
           bool_or(grupo_nome is not null) as eh_grupo,
           round(sum(valor),2) as valor, round(sum(qtd),2) as quantidade, max(data) as ultima
      from itens_r group by 1
  ),
  cli_rank as (select *, row_number() over (order by valor desc) rn from cli)
  select jsonb_build_object(
    'chave', p_chave,
    'rotulo', (select (array_agg(rotulo order by data desc))[1] from itens_r),
    'total', (select round(coalesce(sum(valor),0),2) from itens_r),
    'quantidade', (select round(coalesce(sum(qtd),0),2) from itens_r),
    'porMes', (select coalesce(jsonb_agg(jsonb_build_object(
        'mes', mes, 'valor', valor, 'quantidade', qtd) order by mes), '[]'::jsonb)
      from (select to_char(data,'YYYY-MM') mes, round(sum(valor),2) valor, round(sum(qtd),2) qtd
              from itens_r group by 1) m),
    'porAno', (select coalesce(jsonb_agg(jsonb_build_object(
        'ano', ano, 'valor', valor, 'quantidade', qtd, 'clientes', clientes) order by ano), '[]'::jsonb)
      from (select to_char(data,'YYYY') ano, round(sum(valor),2) valor, round(sum(qtd),2) qtd,
                   count(distinct chave_efetiva) clientes
              from itens_r group by 1) a),
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'ehGrupo', eh_grupo, 'valor', valor,
        'quantidade', quantidade, 'ultima', ultima) order by valor desc), '[]'::jsonb)
      from cli_rank where rn <= 20),
    'clientesFora', greatest(0, (select count(*) from cli) - 20),
    'clientesForaValor', (select round(coalesce(sum(valor),0),2) from cli_rank where rn > 20)
  );
$$;

-- Portas fechadas: so a service_role (as Edge Functions) chama.
revoke all on function public.painel_vendedores_panorama() from public, anon, authenticated;
revoke all on function public.painel_vendedor_detalhe(text, text) from public, anon, authenticated;
revoke all on function public.painel_clientes_abc(text) from public, anon, authenticated;
revoke all on function public.painel_cliente_detalhe(text) from public, anon, authenticated;
revoke all on function public.painel_produtos_panorama(text) from public, anon, authenticated;
revoke all on function public.painel_produto_detalhe(text) from public, anon, authenticated;
grant execute on function public.painel_vendedores_panorama() to service_role;
grant execute on function public.painel_vendedor_detalhe(text, text) to service_role;
grant execute on function public.painel_clientes_abc(text) to service_role;
grant execute on function public.painel_cliente_detalhe(text) to service_role;
grant execute on function public.painel_produtos_panorama(text) to service_role;
grant execute on function public.painel_produto_detalhe(text) to service_role;
