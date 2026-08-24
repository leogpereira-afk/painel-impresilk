-- 1. A ABA "ANOS" DEIXA DE DEPENDER DA PERMUTA MAIS ANTIGA.
--
-- Eu mesmo pus isto ontem, querendo obedecer "réguas iguais": o piso do
-- panorama virou `permutas_historico_desde()`, que é a régua da CARGA (o
-- min(desde) das permutas). Só que a carga não APAGA o que já trouxe: a
-- tabela guarda desde 2020-02 mesmo que a permuta mais antiga passe a pedir
-- 2025. Provado no banco: pondo 2025-06 na permuta mais antiga, a aba caía de
-- 79 meses / R$ 29,1 mi para 15 meses / R$ 6,7 mi -- 64 meses e R$ 22,5
-- milhões sumindo em silêncio porque alguém corrigiu uma data de permuta.
--
-- O piso certo é NENHUM: a tabela mostra o que tem. Quem diz "daqui para trás
-- o painel não tem" é a cobertura, e ela passa a ser a MAIS ANTIGA das duas
-- (a régua da varredura e a primeira O.S. guardada) -- assim janeiro de 2020,
-- varrido e sem venda, continua sendo zero de verdade, e nunca se esconde mês
-- que existe.
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
     where o.data is not null
  )
  select ano, mes,
         round(sum(valor), 2)                     as valor,
         count(*)                                 as os,
         count(distinct cliente_chave)            as clientes,
         round(coalesce(sum(valor) filter (where eh_campanha), 0), 2) as valor_campanha,
         count(*) filter (where eh_campanha)      as os_campanha
    from base
   group by grouping sets ((ano, mes), (ano))
   order by ano, mes nulls first;
$$;

-- O mesmo piso saiu do mês-calendário (tinha a mesma dependência).
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
       and o.data <= current_date
       and extract(month from o.data)::int = p_n
       and (not p_sem_campanha or c.osid is null)
  ),
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
    select chave_r, chave_p, ano, min(rotulo) as rotulo, min(produto) as produto,
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
      'anosSemItens', (select coalesce(jsonb_object_agg(ano, os_sem_itens), '{}'::jsonb) from cob where os_sem_itens > 0),
      'brutoComItens', (select round(coalesce(sum(bruto_com_itens), 0), 2) from cob),
      'valorLido', (select round(coalesce(sum(valor), 0), 2) from prod_ano))
  );
$$;

-- 2. O VIGIA PASSA A OLHAR FONTE POR FONTE.
--
-- Ele conferia só o carimbo global `status.em` -- o mesmo que o painel-dados
-- já documenta como mentiroso ("a fonte que falhou fica com o dado velho e o
-- carimbo novo; carga parcial aparecia como verde"). Provado: pondo 3 dias de
-- atraso só em `recebiveis`, o vigia ficou mudo.
--
-- Agora cada fonte tem a sua régua, pela cadência real da carga:
--   recebiveis/pagar/bancos/orcamentos/ordens/status -> 20 em 20 min (90 min)
--   fluxo_mensal -> uma vez por dia, 07:00 UTC (30 h)
--   historico_status -> diário (30 h)
create or replace function public.painel_vigiar_frescor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual   jsonb;
  v_paradas jsonb;
  v_pior    integer;
begin
  with regua(chave, limite_min) as (
    values ('status', 90), ('recebiveis', 90), ('pagar', 90), ('bancos', 90),
           ('orcamentos', 90), ('ordens', 90), ('dso_hist', 90),
           ('fluxo_mensal', 1800), ('historico_status', 1800)
  ),
  atraso as (
    select r.chave, r.limite_min,
           floor(extract(epoch from now() - c.atualizado_em) / 60)::integer as min
      from regua r left join public.painel_cache c on c.chave = r.chave
  )
  select jsonb_object_agg(chave, min), max(min)
    into v_paradas, v_pior
    from atraso where min is null or min > limite_min;

  select valor into v_atual from public.painel_cache where chave = 'carga_alarme';

  if v_paradas is not null and v_paradas <> '{}'::jsonb then
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', true,
      'atrasoMin', v_pior,
      'fontes', v_paradas,
      'desde', coalesce(
        case when (v_atual->>'parado')::boolean then v_atual->>'desde' end,
        to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      'vistoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    on conflict (chave) do update set valor = excluded.valor;
  elsif (v_atual->>'parado')::boolean then
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', false,
      'voltouEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'ficouParadoDesde', v_atual->>'desde'))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
end;
$$;

-- 3. A COBERTURA DIZ TAMBEM QUANDO A TABELA FOI CARREGADA.
--
-- `ate` e a data da ULTIMA O.S. guardada -- que num sabado sem venda fica
-- dois dias atras sem que falte nada. Para saber ate quando o painel FOI
-- BUSCAR (que e o que decide se um mes vazio e "vendeu zero" ou "nao temos"),
-- vale o carimbo da propria carga. Sem ele, a aba Anos usava a data do CACHE
-- `ordens` -- outra fonte, com outra cadencia, para falar da tabela.
-- (trocar o RETORNO exige derrubar antes: `create or replace` recusa.)
drop function if exists public.painel_ordens_cobertura();
create or replace function public.painel_ordens_cobertura()
returns table(desde date, ate date, quantas bigint, carregado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select min(data), max(data), count(*), max(atualizado_em) from painel_ordens;
$$;
