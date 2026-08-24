-- O MES-CALENDARIO COMPARADO: "todos os janeiros" de uma vez.
--
-- Pedido do dono (23/08): "tem que ter uma maneira de eu clicar e ver todos
-- os meses de janeiro comparados, e o sistema tambem comparar os produtos
-- vendidos daqueles meses para eu ver se existe algum tipo de comportamento
-- parecido".
--
-- Os VALORES ano a ano a tela ja tem (vem do panorama); o que falta e o que
-- nao desce nele: os PRODUTOS daquele mes-calendario, produto a produto, com
-- a distribuicao por ano -- e dai a recorrencia ("bandeira aparece em 5 dos
-- 7 janeiros") salta sozinha.
--
-- `p_sem_campanha` tira as O.S. marcadas nas campanhas: sem ele, agosto e
-- setembro seriam so bandeira e adesivo de eleicao, e o padrao do negocio
-- de base ficaria escondido debaixo do pico.
create or replace function public.painel_anos_mes_cal(p_n int, p_sem_campanha boolean default false)
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
    select o.*, to_char(o.data, 'YYYY') as ano
      from public.painel_ordens o
      left join camp c on c.osid = o.id
     where o.data is not null
       and o.data >= coalesce(public.permutas_historico_desde(), date '2020-01-01')
       -- Teto: O.S. com data futura digitada errada no ERP nao inventa ano.
       and o.data <= current_date
       and extract(month from o.data)::int = p_n
       and (not p_sem_campanha or c.osid is null)
  ),
  -- O GRAO E NORMALIZADO como no resto da casa (chaveProduto): o catalogo do
  -- ERP muda de grafia com o tempo, e "Bandeira 140X90" (2022) contra
  -- "BANDEIRA 140x90" (2024) viraria dois produtos "em 1 de 7" cada -- a
  -- recorrencia, que e a pergunta desta funcao, sairia corrompida.
  itens_mes as (
    select upper(public.unaccent_simples(trim(regexp_replace(
             coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto'), '\s+', ' ', 'g')))) as chave_r,
           upper(public.unaccent_simples(trim(regexp_replace(
             coalesce(i->>'produto', ''), '\s+', ' ', 'g')))) as chave_p,
           coalesce(nullif(trim(i->>'modelo'), ''), i->>'produto') as rotulo,
           i->>'produto' as produto,
           d.ano,
           (i->>'valorTotal')::numeric as valor
      from do_mes d, jsonb_array_elements(d.itens) i
     where coalesce(i->>'produto','') <> ''
  ),
  prod_ano as (
    select chave_r, chave_p, ano,
           -- A grafia exibida e a mais recente daquele ano (min desempata).
           min(rotulo) as rotulo, min(produto) as produto,
           round(sum(valor), 2) as valor
      from itens_mes group by 1, 2, 3
  ),
  tot as (
    select chave_r, chave_p,
           (array_agg(rotulo order by ano desc))[1]  as rotulo,
           (array_agg(produto order by ano desc))[1] as produto,
           round(sum(valor), 2)                      as total,
           count(*) filter (where valor > 0)         as em_anos,
           jsonb_object_agg(ano, valor)              as anos
      from prod_ano group by 1, 2
  ),
  rank as (select *, row_number() over (order by total desc) as rn from tot),
  -- A COBERTURA POR ANO: ano com O.S. sem itens carregados nao pode virar
  -- "nao vendeu" na tela -- e o mesmo zero-nao-e-resultado do painel todo.
  cob as (
    select ano,
           count(*) filter (where jsonb_array_length(coalesce(itens, '[]'::jsonb)) = 0) as os_sem_itens,
           round(coalesce(sum(bruto) filter (where jsonb_array_length(coalesce(itens, '[]'::jsonb)) > 0), 0), 2) as bruto_com_itens
      from do_mes group by ano
  )
  select jsonb_build_object(
    'n', p_n,
    'produtos', (select coalesce(jsonb_agg(jsonb_build_object(
        'rotulo', rotulo, 'produto', produto, 'total', total,
        'emAnos', em_anos, 'anos', anos) order by total desc), '[]'::jsonb)
      from rank where rn <= 20),
    'produtosForaValor', (select round(coalesce(sum(total), 0), 2) from rank where rn > 20),
    'produtosQtd', (select count(*) from tot),
    'cobertura', jsonb_build_object(
      'anosSemItens', (select coalesce(jsonb_object_agg(ano, os_sem_itens), '{}'::jsonb)
                         from cob where os_sem_itens > 0),
      'brutoComItens', (select round(coalesce(sum(bruto_com_itens), 0), 2) from cob),
      'valorLido', (select round(coalesce(sum(valor), 0), 2) from prod_ano))
  );
$$;

revoke all on function public.painel_anos_mes_cal(int, boolean) from public, anon, authenticated;
grant execute on function public.painel_anos_mes_cal(int, boolean) to service_role;
