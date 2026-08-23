-- A BUSCA DE CLIENTES SOBE DE 30 PARA 200 RESULTADOS.
--
-- "Acho que tem mais clientes fora" -- tinha. A base tem 123 candidatos de
-- ELEICAO 2020 e 65 de 2024; quem digitava "ELEICAO 2020" via NO MAXIMO 30
-- nomes (o limit desta funcao) e nao tinha como saber que faltavam 93. O
-- terceiro corte silencioso da mesma semana: chaves em 20, nomes em 30.
--
-- O corpo e o MESMO da versao anterior (ordenacao por data, nome mais recente,
-- unaccent_simples) -- so o limit muda. Reescrever de cabeca ja quase trocou a
-- normalizacao uma vez.
drop function if exists public.painel_ordens_clientes(text, date, date);

create or replace function public.painel_ordens_clientes(
  p_termo text,
  p_desde date default null,
  p_ate   date default null
)
returns table(chave text, nome text, qtd bigint, total numeric, ultima date, cnpjs text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    o.cliente_chave                                as chave,
    (array_agg(o.cliente order by o.data desc nulls last))[1] as nome,
    count(*)                                       as qtd,
    sum(o.valor)                                   as total,
    max(o.data)                                    as ultima,
    coalesce(array_agg(distinct o.cnpj) filter (where o.cnpj <> ''), '{}') as cnpjs
    from painel_ordens o
   where o.cliente_chave like '%' || upper(unaccent_simples(p_termo)) || '%'
     and (p_desde is null or o.data >= p_desde)
     and (p_ate   is null or o.data <= p_ate)
   group by o.cliente_chave
   order by max(o.data) desc nulls last
   limit 200;
$function$;

revoke all on function public.painel_ordens_clientes(text, date, date) from public, anon, authenticated;
grant execute on function public.painel_ordens_clientes(text, date, date) to service_role;
